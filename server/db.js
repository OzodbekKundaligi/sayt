import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:oOtQMUCpqpIzynSCUEVZfCQQBCMQaxBQ@tramway.proxy.rlwy.net:10002';
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'GarajHubsayt';
<<<<<<< HEAD
const DEFAULT_PRO_PLAN_NAME = 'CO Foundix Pro';
const LEGACY_PRO_PLAN_NAME = 'GarajHub Pro';
=======
>>>>>>> c7233f55c37a4a487c49f168b9369d069d0f3ba4

let db = null;

const DEFAULT_CATEGORIES = [
  'Fintex',
  'Edtex',
  "Sun'iy intellekt / ML",
  'Elektron savdo',
  'SaaS',
  'Blokcheyn',
  "Sog'liqni saqlash",
  'Kiberxavfsizlik',
  "O'yin ishlab chiqish",
  'Tarmoqlar',
  'Samaradorlik',
  'Boshqa'
];

const ADMIN_DEFAULT = {
  id: 'admin',
  email: 'mamatovo354@gmail.com',
  password: '123@Ozod',
  name: 'Ozodbek Mamatov',
  phone: '+998932303410',
  role: 'admin'
};

const coll = (name) => {
  if (!db) throw new Error("MongoDB ishga tushirilmagan");
  return db.collection(name);
};

const normalizeSql = (sql) => String(sql || '').replace(/\s+/g, ' ').trim();

const cleanDoc = (doc) => {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
};

const stripAlias = (field) => String(field || '').trim().replace(/^[a-zA-Z_][\w]*\./, '');

const splitCsv = (value) => {
  const out = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if ((ch === '"' || ch === "'") && value[i - 1] !== '\\') {
      if (!quote) quote = ch;
      else if (quote === ch) quote = null;
      current += ch;
      continue;
    }
    if (ch === ',' && !quote) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
};

const parseLiteral = (tokenRaw) => {
  const token = String(tokenRaw || '').trim();
  if (token === 'NULL' || token === 'null') return null;
  if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))) {
    return token.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);
  if (token.toLowerCase() === 'true') return true;
  if (token.toLowerCase() === 'false') return false;
  return token;
};

const compareValues = (left, op, right) => {
  if (op === '=') return left === right;
  if (op === '!=') return left !== right;
  if (op === '>') return left > right;
  if (op === '>=') return left >= right;
  if (op === '<') return left < right;
  if (op === '<=') return left <= right;
  return false;
};

const buildWhereEvaluator = (whereClause, params) => {
  let paramIndex = 0;
  if (!whereClause) return { test: () => true, used: 0 };

  const orParts = String(whereClause)
    .split(/\s+OR\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const buildCondition = (condRaw) => {
    let cond = condRaw.trim();
    if (cond.startsWith('(') && cond.endsWith(')')) cond = cond.slice(1, -1).trim();

    const inMatch = cond.match(/^([\w.]+)\s+IN\s*\((.+)\)$/i);
    if (inMatch) {
      const field = stripAlias(inMatch[1]);
      const tokens = splitCsv(inMatch[2]);
      const values = tokens.map((token) => {
        if (token === '?') {
          const value = params[paramIndex];
          paramIndex += 1;
          return value;
        }
        return parseLiteral(token);
      });
      return (row) => values.includes(row[field]);
    }

    const dateNowMinusDays = cond.match(/^([\w.]+)\s*>=\s*datetime\('now',\s*'-([0-9]+)\s+day'\)$/i);
    if (dateNowMinusDays) {
      const field = stripAlias(dateNowMinusDays[1]);
      const days = Number(dateNowMinusDays[2] || 0);
      const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
      return (row) => {
        const value = row[field];
        const time = value ? new Date(value).getTime() : NaN;
        return Number.isFinite(time) && time >= threshold;
      };
    }

    const match = cond.match(/^([\w.]+)\s*(=|!=|>=|<=|>|<)\s*(.+)$/i);
    if (!match) return () => true;
    const field = stripAlias(match[1]);
    const op = match[2];
    const rightToken = match[3].trim();
    const right = rightToken === '?' ? params[paramIndex++] : parseLiteral(rightToken);
    return (row) => compareValues(row[field], op, right);
  };

  const andGroups = orParts.map((part) =>
    part
      .split(/\s+AND\s+/i)
      .map((x) => x.trim())
      .filter(Boolean)
      .map(buildCondition)
  );

  return {
    test: (row) => andGroups.some((group) => group.every((fn) => fn(row))),
    used: paramIndex
  };
};

const applyOrder = (rows, orderClause) => {
  if (!orderClause) return rows;
  const orders = splitCsv(orderClause).map((part) => {
    const m = part.match(/^([\w.]+)(?:\s+(ASC|DESC))?$/i);
    if (!m) return null;
    return {
      field: stripAlias(m[1]),
      direction: (m[2] || 'ASC').toUpperCase() === 'DESC' ? -1 : 1
    };
  }).filter(Boolean);
  if (orders.length === 0) return rows;

  return [...rows].sort((a, b) => {
    for (const ord of orders) {
      const av = a[ord.field];
      const bv = b[ord.field];
      if (av === bv) continue;
      if (av === undefined || av === null) return -1 * ord.direction;
      if (bv === undefined || bv === null) return 1 * ord.direction;
      if (av > bv) return 1 * ord.direction;
      if (av < bv) return -1 * ord.direction;
    }
    return 0;
  });
};

const applyProjection = (rows, selectClause) => {
  const select = String(selectClause || '*').trim();
  if (select === '*') return rows;

  const fields = splitCsv(select);
  return rows.map((row) => {
    const output = {};
    for (const rawField of fields) {
      const aliasMatch = rawField.match(/^(.+?)\s+as\s+([\w_]+)$/i);
      if (aliasMatch) {
        output[aliasMatch[2]] = row[stripAlias(aliasMatch[1])];
        continue;
      }
      if (rawField.endsWith('.*')) {
        Object.assign(output, row);
        continue;
      }
      const key = stripAlias(rawField);
      output[key] = row[key];
    }
    return output;
  });
};

const nextCategoryId = async () => {
  const maxCategory = await coll('categories').find({}).sort({ id: -1 }).limit(1).toArray();
  const current = Number(maxCategory?.[0]?.id || 0);
  return current + 1;
};

const fetchTableRows = async (table) => {
  const rows = await coll(table).find({}).toArray();
  return rows.map(cleanDoc);
};

const parseInsert = (sql) => {
  const m = sql.match(/^INSERT(?: OR IGNORE)? INTO (\w+) \((.+)\) VALUES \((.+)\)$/i);
  if (!m) return null;
  return {
    ignore: /INSERT OR IGNORE/i.test(sql),
    table: m[1],
    columns: splitCsv(m[2]).map((c) => stripAlias(c))
  };
};

const parseUpdate = (sql) => {
  const m = sql.match(/^UPDATE (\w+) SET (.+) WHERE (.+)$/i);
  if (!m) return null;
  return {
    table: m[1],
    setClause: m[2],
    whereClause: m[3]
  };
};

const parseDelete = (sql) => {
  const m = sql.match(/^DELETE FROM (\w+)(?: WHERE (.+))?$/i);
  if (!m) return null;
  return {
    table: m[1],
    whereClause: m[2] || ''
  };
};

const parseSelect = (sql) => {
  const m = sql.match(/^SELECT (.+) FROM (\w+)(?: WHERE (.+?))?(?: ORDER BY (.+?))?(?: LIMIT (\?|[0-9]+))?$/i);
  if (!m) return null;
  return {
    selectClause: m[1],
    table: m[2],
    whereClause: m[3] || '',
    orderClause: m[4] || '',
    limitToken: m[5] || null
  };
};

const run = async (sqlRaw, params = []) => {
  const sql = normalizeSql(sqlRaw);
  const insert = parseInsert(sql);
  if (insert) {
    const document = {};
    insert.columns.forEach((column, index) => {
      document[column] = params[index];
    });

    if (insert.table === 'categories' && (document.id === undefined || document.id === null)) {
      document.id = await nextCategoryId();
    }

    const existingById = document.id !== undefined
      ? await coll(insert.table).findOne({ id: document.id })
      : null;
    const existingByEmail = insert.table === 'users' && document.email
      ? await coll('users').findOne({ email: document.email })
      : null;
    const existingCategoryByName = insert.table === 'categories' && document.name
      ? await coll('categories').findOne({ name: document.name })
      : null;

    const duplicate = existingById || existingByEmail || existingCategoryByName;
    if (duplicate) {
      if (insert.ignore) return { id: duplicate.id || null, changes: 0 };
      throw new Error("Takroriy kalit");
    }

    await coll(insert.table).insertOne(document);
    return { id: document.id ?? null, changes: 1 };
  }

  const update = parseUpdate(sql);
  if (update) {
    const assignments = splitCsv(update.setClause);
    const updates = {};
    let paramIndex = 0;
    for (const assignmentRaw of assignments) {
      const assignment = assignmentRaw.trim();
      const m = assignment.match(/^([\w.]+)\s*=\s*(.+)$/);
      if (!m) continue;
      const field = stripAlias(m[1]);
      const valueToken = m[2].trim();
      if (valueToken === '?') {
        updates[field] = params[paramIndex++];
      } else {
        updates[field] = parseLiteral(valueToken);
      }
    }

    const whereParams = params.slice(paramIndex);
    const rows = await fetchTableRows(update.table);
    const whereEvaluator = buildWhereEvaluator(update.whereClause, whereParams);
    const matched = rows.filter(whereEvaluator.test);
    if (matched.length === 0) return { id: null, changes: 0 };

    const ids = matched.map((row) => row.id).filter((id) => id !== undefined);
    if (ids.length > 0) {
      await coll(update.table).updateMany({ id: { $in: ids } }, { $set: updates });
    } else {
      const mongoRows = await coll(update.table).find({}).toArray();
      const matchedMongoIds = mongoRows
        .map(cleanDoc)
        .map((clean, idx) => ({ clean, mongoId: mongoRows[idx]._id }))
        .filter((x) => whereEvaluator.test(x.clean))
        .map((x) => x.mongoId);
      if (matchedMongoIds.length > 0) {
        await coll(update.table).updateMany({ _id: { $in: matchedMongoIds } }, { $set: updates });
      }
    }
    return { id: matched[0]?.id ?? null, changes: matched.length };
  }

  const del = parseDelete(sql);
  if (del) {
    if (!del.whereClause) {
      const result = await coll(del.table).deleteMany({});
      return { id: null, changes: result.deletedCount || 0 };
    }
    const rows = await fetchTableRows(del.table);
    const whereEvaluator = buildWhereEvaluator(del.whereClause, params);
    const matched = rows.filter(whereEvaluator.test);
    if (matched.length === 0) return { id: null, changes: 0 };
    const ids = matched.map((row) => row.id).filter((id) => id !== undefined);
    if (ids.length > 0) {
      const result = await coll(del.table).deleteMany({ id: { $in: ids } });
      return { id: null, changes: result.deletedCount || 0 };
    }
    const mongoRows = await coll(del.table).find({}).toArray();
    const matchedMongoIds = mongoRows
      .map(cleanDoc)
      .map((clean, idx) => ({ clean, mongoId: mongoRows[idx]._id }))
      .filter((x) => whereEvaluator.test(x.clean))
      .map((x) => x.mongoId);
    const result = await coll(del.table).deleteMany({ _id: { $in: matchedMongoIds } });
    return { id: null, changes: result.deletedCount || 0 };
  }

  throw new Error(`Qo'llab-quvvatlanmaydigan run so'rovi: ${sql}`);
};

const all = async (sqlRaw, params = []) => {
  const sql = normalizeSql(sqlRaw);

  if (/^SELECT assigned_to_id, COUNT\(\*\) as total, SUM\(CASE WHEN status = 'done' THEN 1 ELSE 0 END\) as done_count FROM tasks WHERE startup_id = \? GROUP BY assigned_to_id$/i.test(sql)) {
    const startupId = params[0];
    const tasks = (await fetchTableRows('tasks')).filter((t) => t.startup_id === startupId);
    const grouped = {};
    tasks.forEach((task) => {
      const key = task.assigned_to_id || '';
      if (!grouped[key]) grouped[key] = { assigned_to_id: key, total: 0, done_count: 0 };
      grouped[key].total += 1;
      if (task.status === 'done') grouped[key].done_count += 1;
    });
    return Object.values(grouped);
  }

  if (/^SELECT user_id, SUM\(hours_spent\) as hours, MAX\(created_at\) as last_activity FROM workspace_activity WHERE startup_id = \? GROUP BY user_id$/i.test(sql)) {
    const startupId = params[0];
    const rows = (await fetchTableRows('workspace_activity')).filter((r) => r.startup_id === startupId);
    const grouped = {};
    rows.forEach((row) => {
      const key = row.user_id || '';
      if (!grouped[key]) grouped[key] = { user_id: key, hours: 0, last_activity: null };
      grouped[key].hours += Number(row.hours_spent || 0);
      if (!grouped[key].last_activity || (row.created_at && row.created_at > grouped[key].last_activity)) {
        grouped[key].last_activity = row.created_at || grouped[key].last_activity;
      }
    });
    return Object.values(grouped);
  }

  if (/^SELECT vote, COUNT\(\*\) as count FROM decision_votes WHERE decision_id = \? GROUP BY vote$/i.test(sql)) {
    const decisionId = params[0];
    const rows = (await fetchTableRows('decision_votes')).filter((r) => r.decision_id === decisionId);
    const grouped = {};
    rows.forEach((row) => {
      const key = row.vote || '';
      grouped[key] = (grouped[key] || 0) + 1;
    });
    return Object.keys(grouped).map((key) => ({ vote: key, count: grouped[key] }));
  }

  if (/^SELECT vote, COUNT\(\*\) as count FROM member_vote_ballots WHERE case_id = \? GROUP BY vote$/i.test(sql)) {
    const caseId = params[0];
    const rows = (await fetchTableRows('member_vote_ballots')).filter((r) => r.case_id === caseId);
    const grouped = {};
    rows.forEach((row) => {
      const key = row.vote || '';
      grouped[key] = (grouped[key] || 0) + 1;
    });
    return Object.keys(grouped).map((key) => ({ vote: key, count: grouped[key] }));
  }

  if (/^SELECT e\.\*, u\.name as user_name FROM equity_allocations e LEFT JOIN users u ON u\.id = e\.user_id WHERE e\.startup_id = \? ORDER BY e\.created_at DESC$/i.test(sql)) {
    const startupId = params[0];
    const equityRows = (await fetchTableRows('equity_allocations')).filter((e) => e.startup_id === startupId);
    const users = await fetchTableRows('users');
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    return applyOrder(
      equityRows.map((e) => ({ ...e, user_name: userMap[e.user_id]?.name || null })),
      'created_at DESC'
    );
  }

  const select = parseSelect(sql);
  if (!select) {
    throw new Error(`Qo'llab-quvvatlanmaydigan all so'rovi: ${sql}`);
  }

  const rows = await fetchTableRows(select.table);

  let whereParams = params;
  let limit = null;
  if (select.limitToken === '?') {
    limit = Number(params[params.length - 1] || 0);
    whereParams = params.slice(0, -1);
  } else if (select.limitToken && /^\d+$/.test(select.limitToken)) {
    limit = Number(select.limitToken);
  }

  const whereEvaluator = buildWhereEvaluator(select.whereClause, whereParams);
  let filtered = rows.filter(whereEvaluator.test);
  filtered = applyOrder(filtered, select.orderClause);
  if (Number.isFinite(limit) && limit > 0) {
    filtered = filtered.slice(0, limit);
  }
  return applyProjection(filtered, select.selectClause);
};

const get = async (sqlRaw, params = []) => {
  const sql = normalizeSql(sqlRaw);
  const countMatch = sql.match(/^SELECT COUNT\(\*\) as count FROM (\w+)(?: WHERE (.+))?$/i);
  if (countMatch) {
    const table = countMatch[1];
    const where = countMatch[2] || '';
    const rows = await fetchTableRows(table);
    const whereEvaluator = buildWhereEvaluator(where, params);
    return { count: rows.filter(whereEvaluator.test).length };
  }

  const rows = await all(sql, params);
  return rows[0] || null;
};

const ensureDefaults = async () => {
  const now = new Date().toISOString();

  const adminById = await coll('users').findOne({ id: ADMIN_DEFAULT.id });
  if (adminById) {
    await coll('users').updateOne(
      { id: ADMIN_DEFAULT.id },
      {
        $set: {
          role: 'admin',
          is_pro: 1,
          pro_status: 'pro',
          pro_updated_at: now,
          banned: 0,
          cv_data: adminById.cv_data || '',
          cv_file_name: adminById.cv_file_name || '',
          cv_mime: adminById.cv_mime || '',
          cv_size: Number(adminById.cv_size || 0),
          cv_updated_at: adminById.cv_updated_at || null
        }
      }
    );
  } else {
    const adminByEmail = await coll('users').findOne({ email: ADMIN_DEFAULT.email });
    if (adminByEmail) {
      await coll('users').updateOne(
        { _id: adminByEmail._id },
        {
          $set: {
            id: ADMIN_DEFAULT.id,
            role: 'admin',
            is_pro: 1,
            pro_status: 'pro',
            pro_updated_at: now,
            banned: 0,
            cv_data: adminByEmail.cv_data || '',
            cv_file_name: adminByEmail.cv_file_name || '',
            cv_mime: adminByEmail.cv_mime || '',
            cv_size: Number(adminByEmail.cv_size || 0),
            cv_updated_at: adminByEmail.cv_updated_at || null
          }
        }
      );
    } else {
      await coll('users').insertOne({
        id: ADMIN_DEFAULT.id,
        email: ADMIN_DEFAULT.email,
        password: ADMIN_DEFAULT.password,
        name: ADMIN_DEFAULT.name,
        phone: ADMIN_DEFAULT.phone,
        role: ADMIN_DEFAULT.role,
        bio: '',
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(ADMIN_DEFAULT.name)}&background=111&color=fff`,
        banner: '',
        portfolio_url: '',
        skills: [],
        languages: [],
        tools: [],
        created_at: now,
        banned: 0,
        is_pro: 1,
        pro_status: 'pro',
        pro_updated_at: now,
        cv_data: '',
        cv_file_name: '',
        cv_mime: '',
        cv_size: 0,
        cv_updated_at: null
      });
    }
  }

  const platformExists = await coll('platform_settings').findOne({ id: 1 });
  if (!platformExists) {
    await coll('platform_settings').insertOne({
      id: 1,
      pro_enabled: 1,
      plan_name: DEFAULT_PRO_PLAN_NAME,
      price_text: '149 000 UZS / oy',
      startup_limit_free: 1,
      updated_at: now
    });
  } else if (!platformExists.plan_name || platformExists.plan_name === LEGACY_PRO_PLAN_NAME) {
    await coll('platform_settings').updateOne(
      { id: 1 },
      {
        $set: {
          plan_name: DEFAULT_PRO_PLAN_NAME,
          updated_at: now
        }
      }
    );
  }

  const billingExists = await coll('billing_settings').findOne({ id: 1 });
  if (!billingExists) {
    await coll('billing_settings').insertOne({
      id: 1,
      card_holder: '',
      card_number: '',
      bank_name: '',
      receipt_note: 'Chek rasmini yuklang',
      updated_at: now
    });
  }

  const categoriesCount = await coll('categories').countDocuments();
  if (categoriesCount === 0) {
    await coll('categories').insertMany(
      DEFAULT_CATEGORIES.map((name, index) => ({
        id: index + 1,
        name,
        created_at: now
      }))
    );
  }
};

const init = async () => {
  if (db) return;
  const options = {};
  if (MONGO_DB_NAME) options.dbName = MONGO_DB_NAME;
  await mongoose.connect(MONGO_URI, options);
  db = mongoose.connection.db;

  await Promise.all([
    coll('users').createIndex({ id: 1 }, { unique: true, sparse: true }),
    coll('users').createIndex({ email: 1 }, { unique: true, sparse: true }),
    coll('startups').createIndex({ id: 1 }, { unique: true, sparse: true }),
    coll('join_requests').createIndex({ id: 1 }, { unique: true, sparse: true }),
    coll('notifications').createIndex({ id: 1 }, { unique: true, sparse: true }),
    coll('tasks').createIndex({ id: 1 }, { unique: true, sparse: true }),
    coll('categories').createIndex({ id: 1 }, { unique: true, sparse: true }),
    coll('categories').createIndex({ name: 1 }, { unique: true, sparse: true }),
    coll('audit_logs').createIndex({ id: 1 }, { unique: true, sparse: true }),
    coll('workspaces').createIndex({ id: 1 }, { unique: true, sparse: true }),
    coll('workspaces').createIndex({ startup_id: 1 }, { unique: true, sparse: true }),
    coll('pro_payment_requests').createIndex({ id: 1 }, { unique: true, sparse: true }),
    coll('peer_reviews').createIndex({ id: 1 }, { unique: true, sparse: true }),
    coll('workspace_decisions').createIndex({ id: 1 }, { unique: true, sparse: true }),
    coll('decision_votes').createIndex({ id: 1 }, { unique: true, sparse: true }),
    coll('decision_votes').createIndex({ decision_id: 1, voter_id: 1 }, { unique: true, sparse: true }),
    coll('member_vote_cases').createIndex({ id: 1 }, { unique: true, sparse: true }),
    coll('member_vote_ballots').createIndex({ id: 1 }, { unique: true, sparse: true }),
    coll('member_vote_ballots').createIndex({ case_id: 1, voter_id: 1 }, { unique: true, sparse: true }),
    coll('equity_allocations').createIndex({ id: 1 }, { unique: true, sparse: true }),
    coll('safekeeping_agreements').createIndex({ id: 1 }, { unique: true, sparse: true }),
    coll('investor_intros').createIndex({ id: 1 }, { unique: true, sparse: true }),
    coll('workspace_activity').createIndex({ id: 1 }, { unique: true, sparse: true }),
    coll('startup_chat_messages').createIndex({ id: 1 }, { unique: true, sparse: true }),
    coll('startup_invitations').createIndex({ id: 1 }, { unique: true, sparse: true })
  ]);

  await ensureDefaults();
};

export { db, run, get, all, init };
