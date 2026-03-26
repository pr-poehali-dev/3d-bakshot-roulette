import json
import os
import hashlib
import secrets
import psycopg2
from datetime import datetime

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def handler(event: dict, context) -> dict:
    """Аутентификация пользователей Buckshot Roulette: регистрация, вход, проверка сессии, выход"""
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id',
        'Content-Type': 'application/json'
    }

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': ''}

    body = json.loads(event.get('body') or '{}')
    action = body.get('action')
    db = get_db()
    cur = db.cursor()

    try:
        if action == 'register':
            username = body.get('username', '').strip()
            password = body.get('password', '')
            if not username or not password:
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Заполни ник и пароль'})}
            if len(username) < 2 or len(username) > 32:
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Ник: 2-32 символа'})}
            if len(password) < 4:
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Пароль минимум 4 символа'})}

            cur.execute("SELECT id FROM bsr_users WHERE username = %s", (username,))
            if cur.fetchone():
                return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Ник уже занят'})}

            pw_hash = hash_password(password)
            cur.execute("INSERT INTO bsr_users (username, password_hash, coins) VALUES (%s, %s, 100) RETURNING id", (username, pw_hash))
            user_id = cur.fetchone()[0]
            cur.execute("INSERT INTO bsr_stats (user_id) VALUES (%s)", (user_id,))

            session_id = secrets.token_hex(32)
            cur.execute("INSERT INTO bsr_sessions (id, user_id) VALUES (%s, %s)", (session_id, user_id))
            db.commit()

            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({
                'ok': True, 'session_id': session_id,
                'user': {'id': user_id, 'username': username, 'coins': 100}
            })}

        elif action == 'login':
            username = body.get('username', '').strip()
            password = body.get('password', '')
            pw_hash = hash_password(password)
            cur.execute("SELECT id, username, coins FROM bsr_users WHERE username = %s AND password_hash = %s", (username, pw_hash))
            row = cur.fetchone()
            if not row:
                return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Неверный ник или пароль'})}

            user_id, uname, coins = row
            session_id = secrets.token_hex(32)
            cur.execute("INSERT INTO bsr_sessions (id, user_id) VALUES (%s, %s)", (session_id, user_id))
            db.commit()

            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({
                'ok': True, 'session_id': session_id,
                'user': {'id': user_id, 'username': uname, 'coins': coins}
            })}

        elif action == 'check':
            session_id = body.get('session_id') or event.get('headers', {}).get('X-Session-Id')
            if not session_id:
                return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Нет сессии'})}
            cur.execute("""
                SELECT u.id, u.username, u.coins FROM bsr_sessions s
                JOIN bsr_users u ON u.id = s.user_id
                WHERE s.id = %s AND s.expires_at > NOW()
            """, (session_id,))
            row = cur.fetchone()
            if not row:
                return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'error': 'Сессия истекла'})}
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({
                'ok': True, 'user': {'id': row[0], 'username': row[1], 'coins': row[2]}
            })}

        elif action == 'logout':
            session_id = body.get('session_id')
            if session_id:
                cur.execute("UPDATE bsr_sessions SET expires_at = NOW() WHERE id = %s", (session_id,))
                db.commit()
            return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'ok': True})}

        else:
            return {'statusCode': 400, 'headers': headers, 'body': json.dumps({'error': 'Неизвестное действие'})}

    finally:
        cur.close()
        db.close()
