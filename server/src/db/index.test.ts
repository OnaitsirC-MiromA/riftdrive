import { describe, expect, it } from 'vitest';
import { openDb, pragma, transaction } from './index';

describe('db', () => {
  it('abre com chaves estrangeiras e migra para a v1', () => {
    const db = openDb(':memory:');
    expect(pragma(db, 'user_version')).toBe(1);
    expect(pragma(db, 'foreign_keys')).toBe(1);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toEqual(
      expect.arrayContaining(['settings', 'oauth_client', 'accounts', 'jobs', 'job_files', 'job_folders', 'copies', 'quota_usage']),
    );
  });

  it('transaction desfaz em erro e aninha com savepoint', () => {
    const db = openDb(':memory:');
    expect(() =>
      transaction(db, () => {
        db.prepare("INSERT INTO settings(key,value) VALUES('a','1')").run();
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(db.prepare('SELECT COUNT(*) AS n FROM settings').get()).toEqual({ n: 0 });

    transaction(db, () => {
      db.prepare("INSERT INTO settings(key,value) VALUES('a','1')").run();
      transaction(db, () => {
        db.prepare("INSERT INTO settings(key,value) VALUES('b','2')").run();
      });
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM settings').get()).toEqual({ n: 2 });
  });

  it('job_files cai em cascata com o job', () => {
    const db = openDb(':memory:');
    db.prepare(
      `INSERT INTO jobs(id,name,src_folder_id,src_reader_account_id,dest_account_id,dest_parent_id,dest_parent_name,dest_final_name,path,mode,status,created_at)
       VALUES('j1','n','s','a','a','p','P','n','rift','copy','queued','2026-01-01T00:00:00Z')`,
    ).run();
    db.prepare(`INSERT INTO job_files(job_id,rel_path,src_id,name,mime_type,size,status) VALUES('j1','a.mp4','f1','a.mp4','video/mp4',10,'pending')`).run();
    db.prepare("DELETE FROM jobs WHERE id='j1'").run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM job_files').get()).toEqual({ n: 0 });
  });
});
