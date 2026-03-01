import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'garajhub.db');
const db = new sqlite3.Database(dbPath);

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });

const ensureColumn = async (table, column, definition) => {
  const cols = await all(`PRAGMA table_info(${table})`);
  const exists = cols.some((c) => c.name === column);
  if (!exists) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

const init = async () => {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT,
      name TEXT NOT NULL,
      phone TEXT,
      role TEXT DEFAULT 'user',
      bio TEXT,
      avatar TEXT,
      banner TEXT,
      portfolio_url TEXT,
      skills TEXT,
      languages TEXT,
      tools TEXT,
      created_at TEXT,
      banned INTEGER DEFAULT 0
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS startups (
      id TEXT PRIMARY KEY,
      nomi TEXT NOT NULL,
      tavsif TEXT,
      category TEXT,
      kerakli_mutaxassislar TEXT,
      logo TEXT,
      egasi_id TEXT,
      egasi_name TEXT,
      status TEXT DEFAULT 'pending_admin',
      yaratilgan_vaqt TEXT,
      a_zolar TEXT,
      tasks TEXT,
      views INTEGER DEFAULT 0,
      github_url TEXT,
      website_url TEXT,
      rejection_reason TEXT,
      FOREIGN KEY (egasi_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS join_requests (
      id TEXT PRIMARY KEY,
      startup_id TEXT,
      startup_name TEXT,
      user_id TEXT,
      user_name TEXT,
      user_phone TEXT,
      specialty TEXT,
      comment TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT,
      FOREIGN KEY (startup_id) REFERENCES startups(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT,
      text TEXT,
      type TEXT DEFAULT 'info',
      is_read INTEGER DEFAULT 0,
      created_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      startup_id TEXT,
      title TEXT,
      description TEXT,
      assigned_to_id TEXT,
      assigned_to_name TEXT,
      deadline TEXT,
      status TEXT DEFAULT 'todo',
      created_at TEXT,
      FOREIGN KEY (startup_id) REFERENCES startups(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      action TEXT,
      entity_type TEXT,
      entity_id TEXT,
      meta TEXT,
      created_at TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      pro_enabled INTEGER DEFAULT 1,
      plan_name TEXT DEFAULT 'GarajHub Pro',
      price_text TEXT DEFAULT '149 000 UZS / oy',
      startup_limit_free INTEGER DEFAULT 1,
      updated_at TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS billing_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      card_holder TEXT DEFAULT '',
      card_number TEXT DEFAULT '',
      bank_name TEXT DEFAULT '',
      receipt_note TEXT DEFAULT 'Chek rasmini yuklang',
      updated_at TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS pro_payment_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      sender_full_name TEXT NOT NULL,
      sender_card_number TEXT NOT NULL,
      receipt_image TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      admin_note TEXT,
      reviewed_by TEXT,
      created_at TEXT,
      reviewed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      startup_id TEXT UNIQUE NOT NULL,
      created_by TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (startup_id) REFERENCES startups(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS workspace_activity (
      id TEXT PRIMARY KEY,
      startup_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      payload TEXT,
      hours_spent REAL DEFAULT 0,
      created_at TEXT,
      FOREIGN KEY (startup_id) REFERENCES startups(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS peer_reviews (
      id TEXT PRIMARY KEY,
      startup_id TEXT NOT NULL,
      from_user_id TEXT NOT NULL,
      to_user_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      task_delivery INTEGER DEFAULT 0,
      collaboration INTEGER DEFAULT 0,
      reliability INTEGER DEFAULT 0,
      comment TEXT,
      created_at TEXT,
      FOREIGN KEY (startup_id) REFERENCES startups(id),
      FOREIGN KEY (from_user_id) REFERENCES users(id),
      FOREIGN KEY (to_user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS workspace_decisions (
      id TEXT PRIMARY KEY,
      startup_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      proposer_id TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      created_at TEXT,
      resolved_at TEXT,
      FOREIGN KEY (startup_id) REFERENCES startups(id),
      FOREIGN KEY (proposer_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS decision_votes (
      id TEXT PRIMARY KEY,
      decision_id TEXT NOT NULL,
      startup_id TEXT NOT NULL,
      voter_id TEXT NOT NULL,
      vote TEXT NOT NULL,
      created_at TEXT,
      UNIQUE(decision_id, voter_id),
      FOREIGN KEY (decision_id) REFERENCES workspace_decisions(id),
      FOREIGN KEY (startup_id) REFERENCES startups(id),
      FOREIGN KEY (voter_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS member_vote_cases (
      id TEXT PRIMARY KEY,
      startup_id TEXT NOT NULL,
      target_user_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      proposer_id TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      resolution TEXT,
      created_at TEXT,
      resolved_at TEXT,
      FOREIGN KEY (startup_id) REFERENCES startups(id),
      FOREIGN KEY (target_user_id) REFERENCES users(id),
      FOREIGN KEY (proposer_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS member_vote_ballots (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      startup_id TEXT NOT NULL,
      voter_id TEXT NOT NULL,
      vote TEXT NOT NULL,
      created_at TEXT,
      UNIQUE(case_id, voter_id),
      FOREIGN KEY (case_id) REFERENCES member_vote_cases(id),
      FOREIGN KEY (startup_id) REFERENCES startups(id),
      FOREIGN KEY (voter_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS equity_allocations (
      id TEXT PRIMARY KEY,
      startup_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      share_percent REAL NOT NULL,
      vesting_months INTEGER DEFAULT 48,
      cliff_months INTEGER DEFAULT 12,
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (startup_id) REFERENCES startups(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS safekeeping_agreements (
      id TEXT PRIMARY KEY,
      startup_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      signed_by TEXT,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (startup_id) REFERENCES startups(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS investor_intros (
      id TEXT PRIMARY KEY,
      startup_id TEXT NOT NULL,
      investor_name TEXT NOT NULL,
      introduced_by TEXT NOT NULL,
      stage TEXT DEFAULT 'seed',
      amount REAL DEFAULT 0,
      status TEXT DEFAULT 'planned',
      notes TEXT,
      created_at TEXT,
      FOREIGN KEY (startup_id) REFERENCES startups(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS startup_chat_messages (
      id TEXT PRIMARY KEY,
      startup_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      message_type TEXT DEFAULT 'text',
      content TEXT,
      file_name TEXT,
      file_url TEXT,
      created_at TEXT,
      FOREIGN KEY (startup_id) REFERENCES startups(id),
      FOREIGN KEY (sender_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS startup_invitations (
      id TEXT PRIMARY KEY,
      startup_id TEXT NOT NULL,
      startup_name TEXT NOT NULL,
      inviter_id TEXT NOT NULL,
      inviter_name TEXT NOT NULL,
      invitee_id TEXT NOT NULL,
      invitee_name TEXT NOT NULL,
      role_hint TEXT,
      status TEXT DEFAULT 'pending',
      notification_id TEXT,
      created_at TEXT,
      responded_at TEXT,
      FOREIGN KEY (startup_id) REFERENCES startups(id),
      FOREIGN KEY (inviter_id) REFERENCES users(id),
      FOREIGN KEY (invitee_id) REFERENCES users(id)
    )
  `);

  await ensureColumn('users', 'banned', 'INTEGER DEFAULT 0');
  await ensureColumn('users', 'is_pro', 'INTEGER DEFAULT 0');
  await ensureColumn('users', 'pro_status', `TEXT DEFAULT 'free'`);
  await ensureColumn('users', 'pro_updated_at', 'TEXT');
  await ensureColumn('users', 'banner', 'TEXT');
  await ensureColumn('notifications', 'meta', 'TEXT');
  await ensureColumn('startups', 'segment', `TEXT DEFAULT 'IT Founder + Developer'`);
  await ensureColumn('startups', 'lifecycle_status', `TEXT DEFAULT 'live'`);
  await ensureColumn('startups', 'success_fee_percent', 'REAL DEFAULT 1.5');
  await ensureColumn('startups', 'registry_notes', 'TEXT');

  await run(
    `INSERT OR IGNORE INTO platform_settings (id, pro_enabled, plan_name, price_text, startup_limit_free, updated_at)
     VALUES (1, 1, 'GarajHub Pro', '149 000 UZS / oy', 1, ?)
    `,
    [new Date().toISOString()]
  );

  await run(
    `INSERT OR IGNORE INTO billing_settings (id, card_holder, card_number, bank_name, receipt_note, updated_at)
     VALUES (1, '', '', '', 'Chek rasmini yuklang', ?)
    `,
    [new Date().toISOString()]
  );

  const existingCategories = await all('SELECT * FROM categories');
  if (existingCategories.length === 0) {
    const defaults = [
      "Fintech",
      "Edtech",
      "AI/ML",
      "E-commerce",
      "SaaS",
      "Blockchain",
      "Healthcare",
      "Cybersecurity",
      "GameDev",
      "Networking",
      "Productivity",
      "Other"
    ];
    for (const name of defaults) {
      await run('INSERT INTO categories (name, created_at) VALUES (?, ?)', [
        name,
        new Date().toISOString()
      ]);
    }
  }
};

export { db, run, get, all, init };
