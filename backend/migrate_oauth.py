# backend/migrate_oauth.py
from app.db.session import engine
from sqlalchemy import text

def run_migration():
    with engine.connect() as conn:
        try:
            # Add google_id column
            conn.execute(text('ALTER TABLE users ADD COLUMN google_id VARCHAR UNIQUE'))
            print('✅ Added google_id column')
        except Exception as e:
            print(f'⚠️ google_id column: {e}')
        
        try:
            # Add is_verified column
            conn.execute(text('ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT 0'))
            print('✅ Added is_verified column')
        except Exception as e:
            print(f'⚠️ is_verified column: {e}')
        
        try:
            # Create index
            conn.execute(text('CREATE INDEX ix_users_google_id ON users (google_id)'))
            print('✅ Created index on google_id')
        except Exception as e:
            print(f'⚠️ Index: {e}')
        
        conn.commit()
        print('\n✅ Database migration completed!')

if __name__ == "__main__":
    run_migration()