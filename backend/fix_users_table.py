# backend/fix_users_table_complete.py
import sqlite3
import shutil
from datetime import datetime

def fix_users_table_complete():
    """Fix users table with all required columns"""
    
    db_path = 'app.db'
    backup_path = f'app.db.backup_{datetime.now().strftime("%Y%m%d_%H%M%S")}'
    
    print('🔍 Checking database schema...\n')
    
    # Create backup
    print(f'📦 Creating backup: {backup_path}')
    shutil.copy2(db_path, backup_path)
    print('✅ Backup created\n')
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Get current schema
        cursor.execute("PRAGMA table_info(users)")
        columns = cursor.fetchall()
        column_names = [col[1] for col in columns]
        
        print('📋 Current columns:')
        for col in columns:
            print(f'  {col[1]}: {col[2]} (nullable: {col[3] == 0})')
        
        # Check what's missing
        required_columns = ['embedding', 'hashed_password']
        missing = [c for c in required_columns if c not in column_names]
        needs_fix = False
        
        # Check if hashed_password is nullable
        if 'hashed_password' in column_names:
            hashed_pwd_col = [col for col in columns if col[1] == 'hashed_password'][0]
            is_nullable = hashed_pwd_col[3] == 0
            if not is_nullable:
                needs_fix = True
                print('\n⚠️  hashed_password is NOT NULL (needs to be nullable)')
        
        if missing:
            needs_fix = True
            print(f'\n⚠️  Missing columns: {", ".join(missing)}')
        
        if not needs_fix:
            print('\n✅ Schema is already correct. No migration needed.')
            conn.close()
            return
        
        print('\n🔧 Recreating users table with correct schema...\n')
        
        # Step 1: Create new table with complete schema
        cursor.execute('''
            CREATE TABLE users_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email VARCHAR NOT NULL UNIQUE,
                name VARCHAR,
                hashed_password VARCHAR,
                google_id VARCHAR UNIQUE,
                is_verified BOOLEAN DEFAULT 0,
                bio TEXT,
                role VARCHAR,
                skills JSON,
                embedding JSON,
                is_active BOOLEAN DEFAULT 1,
                email_verified BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        print('✅ Created new table with complete schema')
        
        # Step 2: Build dynamic INSERT based on existing columns
        existing_cols = ', '.join(column_names)
        cursor.execute(f'''
            INSERT INTO users_new ({existing_cols})
            SELECT {existing_cols} FROM users
        ''')
        print('✅ Copied all data to new table')
        
        # Step 3: Drop old table
        cursor.execute('DROP TABLE users')
        print('✅ Dropped old table')
        
        # Step 4: Rename new table
        cursor.execute('ALTER TABLE users_new RENAME TO users')
        print('✅ Renamed new table to users')
        
        # Step 5: Recreate indexes
        cursor.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email)')
        cursor.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id) WHERE google_id IS NOT NULL')
        print('✅ Recreated indexes')
        
        conn.commit()
        
        # Verify
        cursor.execute("PRAGMA table_info(users)")
        new_columns = cursor.fetchall()
        new_column_names = [col[1] for col in new_columns]
        
        print(f'\n✅ Migration successful!')
        print(f'  Total columns: {len(new_column_names)}')
        print(f'  Has embedding: {"✅" if "embedding" in new_column_names else "❌"}')
        
        hashed_pwd_new = [col for col in new_columns if col[1] == 'hashed_password'][0]
        print(f'  hashed_password nullable: {"✅" if hashed_pwd_new[3] == 0 else "❌"}')
        
        print(f'\n📦 Backup saved at: {backup_path}')
        print('\n🎉 Database schema is now correct!')
        
    except Exception as e:
        print(f'\n❌ Migration failed: {e}')
        print('🔄 Restoring from backup...')
        conn.close()
        shutil.copy2(backup_path, db_path)
        print('✅ Database restored')
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    fix_users_table_complete()