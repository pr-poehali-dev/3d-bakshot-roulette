import json
import os
import psycopg2

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def handler(event: dict, context) -> dict:
    """Таблица лидеров Buckshot Roulette: мировой рейтинг и личная статистика"""
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id',
        'Content-Type': 'application/json'
    }

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': ''}

    db = get_db()
    cur = db.cursor()

    try:
        cur.execute("""
            SELECT u.username, s.score, s.games_played, s.games_won, u.coins,
                   RANK() OVER (ORDER BY s.score DESC) as rank
            FROM bsr_stats s
            JOIN bsr_users u ON u.id = s.user_id
            WHERE s.games_played > 0
            ORDER BY s.score DESC
            LIMIT 50
        """)
        leaders = []
        for row in cur.fetchall():
            username, score, played, won, coins, rank = row
            winrate = round((won / played * 100) if played > 0 else 0, 1)
            leaders.append({
                'rank': rank,
                'username': username,
                'score': score,
                'games_played': played,
                'games_won': won,
                'winrate': winrate,
                'coins': coins
            })

        session_id = event.get('headers', {}).get('X-Session-Id') or event.get('headers', {}).get('x-session-id')
        my_stats = None
        if session_id:
            cur.execute("""
                SELECT u.id, u.username, s.score, s.games_played, s.games_won, u.coins,
                       RANK() OVER (ORDER BY s.score DESC) as rank
                FROM bsr_sessions ses
                JOIN bsr_users u ON u.id = ses.user_id
                JOIN bsr_stats s ON s.user_id = u.id
                WHERE ses.id = %s AND ses.expires_at > NOW()
            """, (session_id,))
            row = cur.fetchone()
            if row:
                uid, uname, score, played, won, coins, rank = row
                winrate = round((won / played * 100) if played > 0 else 0, 1)
                my_stats = {
                    'rank': rank, 'username': uname, 'score': score,
                    'games_played': played, 'games_won': won,
                    'winrate': winrate, 'coins': coins
                }

        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({
            'ok': True,
            'leaderboard': leaders,
            'my_stats': my_stats
        })}

    finally:
        cur.close()
        db.close()
