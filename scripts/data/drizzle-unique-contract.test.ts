import {DatabaseSync} from 'node:sqlite';
import {sqliteTable,text,unique} from 'drizzle-orm/sqlite-core';
import {expect,it} from 'vitest';
import {buildDrizzleContract,diffDrizzleContract,inspectDatabase} from './schema-contract';

it.each([undefined, 'explicit_column'])('checks a Drizzle column unique constraint (%s)', name => {
  const probe = sqliteTable('column_probe', { value: text('value').unique(name) });
  const contract = buildDrizzleContract({ probe });
  const valid = new DatabaseSync(':memory:');
  const missing = new DatabaseSync(':memory:');
  try {
    valid.exec('CREATE TABLE column_probe(value TEXT UNIQUE);');
    missing.exec('CREATE TABLE column_probe(value TEXT);');
    expect(contract.tables.column_probe.indexes).toContainEqual(expect.objectContaining({
      name: name ?? 'column_probe_value_unique', unique: true, columns: ['value'], matchByColumns: true,
    }));
    expect(diffDrizzleContract(contract, inspectDatabase(valid)).verdict).toBe('pass');
    expect(diffDrizzleContract(contract, inspectDatabase(missing)).verdict).toBe('fail');
  } finally { valid.close(); missing.close(); }
});

it.each([undefined,'explicit_pair'])('checks the installed Drizzle table-level unique API (%s)',name=>{
  const probe=sqliteTable('unique_probe',{a:text('a'),b:text('b')},table=>[unique(name).on(table.a,table.b)]);
  const contract=buildDrizzleContract({probe});
  const valid=new DatabaseSync(':memory:');
  const missing=new DatabaseSync(':memory:');
  try {
    valid.exec('CREATE TABLE unique_probe(a TEXT,b TEXT,UNIQUE(a,b));');
    missing.exec('CREATE TABLE unique_probe(a TEXT,b TEXT);');
    expect(contract.tables.unique_probe.indexes).toContainEqual(expect.objectContaining({name:name??'unique_probe_a_b_unique',unique:true,columns:['a','b'],matchByColumns:true}));
    expect(diffDrizzleContract(contract,inspectDatabase(valid)).verdict).toBe('pass');
    expect(diffDrizzleContract(contract,inspectDatabase(missing)).verdict).toBe('fail');
  } finally {valid.close();missing.close();}
});
