import json
import os
import secrets
import random
import psycopg2
from datetime import datetime

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def get_user_from_session(cur, session_id):
    if not session_id:
        return None
    cur.execute("""
        SELECT u.id, u.username, u.coins FROM bsr_sessions s
        JOIN bsr_users u ON u.id = s.user_id
        WHERE s.id = %s AND s.expires_at > NOW()
    """, (session_id,))
    return cur.fetchone()

BOT_NAMES = ['DEALER_BOT', 'SHADOW_X', 'REAPER_AI', 'GHOST_7', 'IRON_MIKE', 'VOID_AGENT']

def make_shotgun_shells(live: int, blank: int):
    shells = ['live'] * live + ['blank'] * blank
    random.shuffle(shells)
    return shells

def bot_action(game_state: dict, bot_slot: int) -> str:
    shells = game_state.get('shells', [])
    if not shells:
        return 'shoot_other'
    live_count = shells.count('live')
    blank_count = shells.count('blank')
    total = len(shells)
    live_prob = live_count / total if total > 0 else 0.5
    if live_prob < 0.3:
        return 'shoot_self'
    return 'shoot_other'

def get_players_list(cur, game_id):
    cur.execute("""
        SELECT gp.slot, gp.is_bot, gp.bot_name, gp.hp, gp.max_hp, gp.coins, gp.items, gp.alive, gp.is_winner,
               u.username, u.id as user_id
        FROM bsr_game_players gp
        LEFT JOIN bsr_users u ON u.id = gp.user_id
        WHERE gp.game_id = %s ORDER BY gp.slot
    """, (game_id,))
    players = []
    for p in cur.fetchall():
        slot, is_bot, bot_name, hp, max_hp, pc, items, alive, is_winner, uname, uid = p
        players.append({
            'slot': slot, 'is_bot': is_bot,
            'name': bot_name if is_bot else uname,
            'hp': hp, 'max_hp': max_hp, 'coins': pc,
            'items': items if isinstance(items, list) else json.loads(items or '[]'),
            'alive': alive, 'is_winner': is_winner,
            'user_id': uid
        })
    return players

def handler(event: dict, context) -> dict:
    """Игровая логика Buckshot Roulette: создание комнат, лобби, ходы, состояние игры"""
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id',
        'Content-Type': 'application/json'
    }

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': ''}

    session_id = event.get('headers', {}).get('X-Session-Id') or event.get('headers', {}).get('x-session-id')
    body = json.loads(event.get('body') or '{}')
    action = body.get('action')
    db = get_db()
    cur = db.cursor()

    try:
        user_row = get_user_from_session(cur, session_id)
        if not user_row and action not in ['state', 'lobby']:
            return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Не авторизован'})}

        if user_row:
            user_id, username, coins = user_row

        if action == 'create':
            mode = body.get('mode', 'pvp')
            max_players = int(body.get('max_players', 2))
            bot_count = int(body.get('bot_count', 0))

            room_code = secrets.token_hex(3).upper()
            live = random.randint(1, 4)
            blank = random.randint(1, 4)
            shells = make_shotgun_shells(live, blank)

            game_state = {
                'shells': shells,
                'shell_count': len(shells),
                'live_count': live,
                'blank_count': blank,
                'round_items': [],
                'last_shot': None,
                'last_action_log': []
            }

            cur.execute("""
                INSERT INTO bsr_games (room_code, status, mode, max_players, game_state, created_by)
                VALUES (%s, 'waiting', %s, %s, %s, %s) RETURNING id
            """, (room_code, mode, max_players, json.dumps(game_state), user_id))
            game_id = cur.fetchone()[0]

            cur.execute("""
                INSERT INTO bsr_game_players (game_id, user_id, slot, hp, max_hp, coins)
                VALUES (%s, %s, 0, 2, 2, 10)
            """, (game_id, user_id))

            for i in range(bot_count):
                bot_name = random.choice(BOT_NAMES)
                cur.execute("""
                    INSERT INTO bsr_game_players (game_id, user_id, slot, is_bot, bot_name, hp, max_hp, coins)
                    VALUES (%s, NULL, %s, TRUE, %s, 2, 2, 10)
                """, (game_id, i + 1, bot_name))

            if mode == 'solo' or bot_count > 0:
                cur.execute("UPDATE bsr_games SET status = 'playing' WHERE id = %s", (game_id,))

            db.commit()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({
                'ok': True, 'game_id': game_id, 'room_code': room_code,
                'shells': len(shells), 'live': live, 'blank': blank,
                'is_host': True, 'status': 'playing' if (mode == 'solo' or bot_count > 0) else 'waiting'
            })}

        elif action == 'join':
            room_code = body.get('room_code', '').upper().strip()
            cur.execute("SELECT id, status, max_players, created_by FROM bsr_games WHERE room_code = %s", (room_code,))
            game_row = cur.fetchone()
            if not game_row:
                return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Комната не найдена'})}
            game_id, status, max_players, created_by = game_row
            if status == 'finished':
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Игра уже завершена'})}

            cur.execute("SELECT COUNT(*) FROM bsr_game_players WHERE game_id = %s", (game_id,))
            player_count = cur.fetchone()[0]

            cur.execute("SELECT id FROM bsr_game_players WHERE game_id = %s AND user_id = %s", (game_id, user_id))
            already_in = cur.fetchone()

            if not already_in:
                if status == 'playing':
                    return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Игра уже началась'})}
                if player_count >= max_players:
                    return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Комната заполнена'})}
                cur.execute("""
                    INSERT INTO bsr_game_players (game_id, user_id, slot, hp, max_hp, coins)
                    VALUES (%s, %s, %s, 2, 2, 10)
                """, (game_id, user_id, player_count))
                db.commit()

            is_host = (created_by == user_id)
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({
                'ok': True, 'game_id': game_id, 'room_code': room_code,
                'is_host': is_host, 'status': status
            })}

        elif action == 'lobby':
            game_id = int(body.get('game_id', 0))
            cur.execute("SELECT id, room_code, status, mode, max_players, created_by FROM bsr_games WHERE id = %s", (game_id,))
            game_row = cur.fetchone()
            if not game_row:
                return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Игра не найдена'})}
            g_id, room_code, status, mode, max_players, created_by = game_row
            players = get_players_list(cur, game_id)
            is_host = user_row and (created_by == user_row[0])
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({
                'ok': True, 'game_id': g_id, 'room_code': room_code,
                'status': status, 'mode': mode, 'max_players': max_players,
                'players': players, 'is_host': is_host,
                'player_count': len(players)
            })}

        elif action == 'start':
            game_id = int(body.get('game_id', 0))
            cur.execute("SELECT id, status, created_by, max_players FROM bsr_games WHERE id = %s", (game_id,))
            game_row = cur.fetchone()
            if not game_row:
                return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Игра не найдена'})}
            g_id, status, created_by, max_players = game_row
            if created_by != user_id:
                return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Только хост может запустить игру'})}
            if status != 'waiting':
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Игра уже запущена или завершена'})}
            cur.execute("SELECT COUNT(*) FROM bsr_game_players WHERE game_id = %s", (game_id,))
            cnt = cur.fetchone()[0]
            if cnt < 2:
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Нужно минимум 2 игрока'})}
            cur.execute("UPDATE bsr_games SET status = 'playing' WHERE id = %s", (game_id,))
            db.commit()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True, 'game_id': game_id})}

        elif action == 'state':
            game_id = int(body.get('game_id', 0))
            cur.execute("SELECT id, room_code, status, mode, max_players, current_turn, round, game_state, created_by FROM bsr_games WHERE id = %s", (game_id,))
            game_row = cur.fetchone()
            if not game_row:
                return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Игра не найдена'})}

            g_id, room_code, status, mode, max_players, current_turn, rnd, gs, created_by = game_row
            game_state = gs if isinstance(gs, dict) else json.loads(gs)
            players = get_players_list(cur, game_id)
            is_host = user_row and (created_by == user_row[0])

            shells_hidden = ['?'] * len(game_state.get('shells', []))
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({
                'ok': True,
                'game': {
                    'id': g_id, 'room_code': room_code, 'status': status,
                    'mode': mode, 'max_players': max_players,
                    'current_turn': current_turn, 'round': rnd,
                    'shells_remaining': len(game_state.get('shells', [])),
                    'last_shot': game_state.get('last_shot'),
                    'log': game_state.get('last_action_log', []),
                    'is_host': is_host
                },
                'players': players,
                'shells_hint': shells_hidden
            })}

        elif action == 'shoot':
            game_id = int(body.get('game_id', 0))
            target = body.get('target', 'other')

            cur.execute("SELECT id, status, current_turn, round, game_state, max_players FROM bsr_games WHERE id = %s", (game_id,))
            game_row = cur.fetchone()
            if not game_row:
                return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'error': 'Игра не найдена'})}

            g_id, status, current_turn, rnd, gs, max_players = game_row
            if status != 'playing':
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Игра не активна'})}

            game_state = gs if isinstance(gs, dict) else json.loads(gs)

            cur.execute("""
                SELECT gp.id, gp.slot, gp.user_id, gp.is_bot, gp.hp, gp.alive
                FROM bsr_game_players gp WHERE gp.game_id = %s ORDER BY gp.slot
            """, (game_id,))
            players_db = cur.fetchall()
            active_players = [p for p in players_db if p[5]]

            shooter = None
            for p in active_players:
                if p[1] == current_turn:
                    shooter = p
                    break
            if not shooter:
                shooter = active_players[0] if active_players else None

            if not shooter:
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Нет активных игроков'})}

            if not shooter[3] and shooter[2] != user_id:
                return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'error': 'Сейчас не твой ход'})}

            shells = game_state.get('shells', [])
            if not shells:
                live = random.randint(1, 4)
                blank = random.randint(1, 4)
                shells = make_shotgun_shells(live, blank)
                game_state['live_count'] = live
                game_state['blank_count'] = blank
                rnd += 1

            shell = shells.pop(0)
            game_state['shells'] = shells
            game_state['last_shot'] = shell

            shooter_name = 'BOT' if shooter[3] else username
            log_entry = f"[R{rnd}] {shooter_name} -> {'SELF' if target == 'self' else 'OTHER'}: {shell.upper()}"
            log = game_state.get('last_action_log', [])
            log.append(log_entry)
            if len(log) > 20:
                log = log[-20:]
            game_state['last_action_log'] = log

            next_turn = current_turn
            game_over = False
            winner_slot = None
            stayed_turn = False

            if target == 'self':
                if shell == 'live':
                    shooter_db_id = shooter[0]
                    new_hp = max(0, shooter[4] - 1)
                    cur.execute("UPDATE bsr_game_players SET hp = %s, alive = %s WHERE id = %s",
                                (new_hp, new_hp > 0, shooter_db_id))
                    if new_hp <= 0:
                        alive_after = [p for p in active_players if p[0] != shooter_db_id]
                        if len(alive_after) == 1:
                            game_over = True
                            winner_slot = alive_after[0][1]
                    active_slots = [p[1] for p in active_players if p[5]]
                    idx = active_slots.index(current_turn) if current_turn in active_slots else 0
                    next_idx = (idx + 1) % len(active_slots) if active_slots else 0
                    next_turn = active_slots[next_idx] if active_slots else 0
                else:
                    stayed_turn = True
                    next_turn = current_turn
            else:
                if shell == 'live':
                    targets = [p for p in active_players if p[1] != current_turn]
                    if targets:
                        victim = targets[0]
                        new_hp = max(0, victim[4] - 1)
                        cur.execute("UPDATE bsr_game_players SET hp = %s, alive = %s WHERE id = %s",
                                    (new_hp, new_hp > 0, victim[0]))
                        if new_hp <= 0:
                            alive_remaining = [p for p in active_players if p[0] != victim[0] and p[5]]
                            if len(alive_remaining) == 1:
                                game_over = True
                                winner_slot = alive_remaining[0][1]
                active_slots = [p[1] for p in active_players if p[5]]
                idx = active_slots.index(current_turn) if current_turn in active_slots else 0
                next_idx = (idx + 1) % len(active_slots) if active_slots else 0
                next_turn = active_slots[next_idx] if active_slots else 0

            if game_over and winner_slot is not None:
                cur.execute("UPDATE bsr_game_players SET is_winner = TRUE WHERE game_id = %s AND slot = %s",
                            (game_id, winner_slot))
                cur.execute("UPDATE bsr_games SET status = 'finished', finished_at = NOW(), current_turn = %s, round = %s, game_state = %s WHERE id = %s",
                            (next_turn, rnd, json.dumps(game_state), game_id))
                cur.execute("""
                    SELECT gp.user_id, gp.is_winner FROM bsr_game_players gp WHERE gp.game_id = %s AND gp.user_id IS NOT NULL
                """, (game_id,))
                for uid_row, is_win in cur.fetchall():
                    result = 'win' if is_win else 'lose'
                    score = 100 if is_win else 10
                    coins_delta = 50 if is_win else -10
                    cur.execute("""
                        INSERT INTO bsr_game_history (user_id, game_id, result, score, rounds, coins_change, players_count)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """, (uid_row, game_id, result, score, rnd, coins_delta, max_players))
                    cur.execute("""
                        UPDATE bsr_stats SET games_played = games_played + 1,
                        games_won = games_won + %s, score = score + %s, updated_at = NOW()
                        WHERE user_id = %s
                    """, (1 if is_win else 0, score, uid_row))
                    cur.execute("UPDATE bsr_users SET coins = GREATEST(0, coins + %s) WHERE id = %s",
                                (coins_delta, uid_row))
            else:
                cur.execute("UPDATE bsr_games SET current_turn = %s, round = %s, game_state = %s WHERE id = %s",
                            (next_turn, rnd, json.dumps(game_state), game_id))

            db.commit()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({
                'ok': True, 'shell': shell,
                'game_over': game_over,
                'winner_slot': winner_slot,
                'shells_remaining': len(shells),
                'next_turn': next_turn,
                'stayed_turn': stayed_turn,
                'log': log
            })}

        elif action == 'history':
            cur.execute("""
                SELECT h.result, h.score, h.rounds, h.coins_change, h.players_count, h.played_at, g.room_code
                FROM bsr_game_history h
                LEFT JOIN bsr_games g ON g.id = h.game_id
                WHERE h.user_id = %s ORDER BY h.played_at DESC LIMIT 20
            """, (user_id,))
            hist = []
            for row in cur.fetchall():
                hist.append({
                    'result': row[0], 'score': row[1], 'rounds': row[2],
                    'coins_change': row[3], 'players_count': row[4],
                    'played_at': row[5].isoformat() if row[5] else None,
                    'room_code': row[6]
                })
            cur.execute("SELECT games_played, games_won, score, coins_earned FROM bsr_stats WHERE user_id = %s", (user_id,))
            sr = cur.fetchone()
            stats = {'games_played': 0, 'games_won': 0, 'score': 0}
            if sr:
                stats = {'games_played': sr[0], 'games_won': sr[1], 'score': sr[2]}
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True, 'history': hist, 'stats': stats})}

        else:
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Неизвестное действие'})}

    finally:
        cur.close()
        db.close()
