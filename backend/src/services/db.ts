import { Pool } from 'pg'
import { v4 as uuidv4 } from 'uuid'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required')

export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 })

export async function initDB() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(50) UNIQUE NOT NULL,
        logo_url TEXT,
        primary_color VARCHAR(7) DEFAULT '#6366f1',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) DEFAULT '',
        role VARCHAR(50) DEFAULT 'member',
        avatar_url TEXT,
        is_bot BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(workspace_id, email)
      );

      CREATE TABLE IF NOT EXISTS channels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        is_private BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS channel_members (
        channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (channel_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
        thread_id UUID REFERENCES messages(id) ON DELETE CASCADE,
        sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
        sender_name VARCHAR(100) NOT NULL,
        sender_is_bot BOOLEAN DEFAULT false,
        content TEXT,
        file_url TEXT,
        file_name VARCHAR(255),
        file_type VARCHAR(100),
        reactions JSONB DEFAULT '{}',
        reply_count INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at ASC);

      CREATE TABLE IF NOT EXISTS dm_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
        from_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        from_user_name VARCHAR(100) NOT NULL,
        from_user_is_bot BOOLEAN DEFAULT false,
        content TEXT,
        file_url TEXT,
        file_name VARCHAR(255),
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_dm_messages_users ON dm_messages(from_user_id, to_user_id, created_at DESC);
    `)

    // Seed default workspace
    const wsResult = await client.query(`
      INSERT INTO workspaces (id, name, slug) VALUES
        ('00000000-0000-0000-0000-000000000000', 'NeuralStudio', 'neuralstudio')
      ON CONFLICT (slug) DO NOTHING RETURNING id
    `)

    const wsId = '00000000-0000-0000-0000-000000000000'

    // Seed AI employees
    await client.query(`
      INSERT INTO users (id, workspace_id, name, email, role, is_bot) VALUES
        ('00000000-0000-0000-0000-000000000001', $1, '민이사', 'min-cso@teamver.ai', 'CSO', true),
        ('00000000-0000-0000-0000-000000000002', $1, '민소장', 'min-director@teamver.ai', '소장', true),
        ('00000000-0000-0000-0000-000000000003', $1, '민팀장', 'min-manager@teamver.ai', '팀장', true)
      ON CONFLICT (workspace_id, email) DO NOTHING
    `, [wsId])

    // Seed channels
    const chGeneral = uuidv4()
    const chDev = uuidv4()
    await client.query(`
      INSERT INTO channels (id, workspace_id, name, description) VALUES
        ($1, $3, 'general', '일반 채널'),
        ($2, $3, '개발', '개발 채널')
      ON CONFLICT DO NOTHING
    `, [chGeneral, chDev, wsId])

    console.log('✅ Database initialized')
  } finally {
    client.release()
  }
}
