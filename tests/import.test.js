import { describe, it, expect } from 'vitest';
import { buildImportPlan } from '../src/domain/importMap.js';
import { parsePayload } from '../src/domain/exchange.js';

const db = {
  ingredients: [
    { id: 'e1', name: 'Яйцо', mode: 'perPiece', kcal: 78 },
    { id: 'm1', name: 'Молоко', mode: 'per100g', kcal: 52 }
  ]
};

describe('recipe import mapping', () => {
  it('matches existing names exactly (after trim), creates unknown ones', () => {
    const payload = parsePayload(
      '{"v":1,"type":"recipe","name":"Омлет","items":[[" Яйцо ",3,"pc",78],["Мука",100,"g",342,{"p":10}]],"portions":2,"weight":null,"text":""}'
    );
    const { plan } = buildImportPlan(payload, db);
    expect(plan.matched[0].ingredientId).toBe('e1'); // existing used
    expect(plan.created).toEqual([{ name: 'Мука', mode: 'per100g', kcal: 342, n: { p: 10 } }]);
    expect(plan.errors).toEqual([]);
  });

  it('case-sensitive matching: "яйцо" != "Яйцо"', () => {
    const payload = parsePayload('{"v":1,"type":"recipe","name":"X","items":[["яйцо",1,"pc",78]]}');
    const { plan } = buildImportPlan(payload, db);
    expect(plan.created.length).toBe(1);
    expect(plan.matched[0].newIngredient).toBe(true);
  });

  it('unit conflict with stored type is reconciled with a warning', () => {
    const payload = parsePayload('{"v":1,"type":"recipe","name":"X","items":[["Яйцо",100,"g",78],["Молоко",2,"pc",52]]}');
    const { plan } = buildImportPlan(payload, db);
    expect(plan.matched[0].unit).toBe('pc');
    expect(plan.matched[1].unit).toBe('g');
    expect(plan.warnings.length).toBe(2);
  });

  it('duplicate ingredient rows in payload -> error, skipped', () => {
    const payload = parsePayload('{"v":1,"type":"recipe","name":"X","items":[["Яйцо",1,"pc",78],["Яйцо",2,"pc",78]]}');
    const { plan } = buildImportPlan(payload, db);
    expect(plan.items.length).toBe(1);
    expect(plan.errors.length).toBe(1);
  });

  it('g vs ml for per-100g ingredient is NOT a conflict', () => {
    const payload = parsePayload('{"v":1,"type":"recipe","name":"X","items":[["Молоко",50,"ml",52]]}');
    const { plan } = buildImportPlan(payload, db);
    expect(plan.warnings).toEqual([]);
    expect(plan.matched[0].unit).toBe('ml');
  });
});

describe('catalog import mapping', () => {
  it('adds new names, updates kcal/nutrients of existing ones when present', () => {
    const payload = parsePayload(
      '{"v":1,"type":"catalog","ingredients":[{"name":"Яйцо","mode":"perPiece","kcal":80,"n":{"p":13}},{"name":"Сыр","mode":"per100g","kcal":350}]}'
    );
    const { plan } = buildImportPlan(payload, db);
    expect(plan.toUpdate).toEqual([{ id: 'e1', name: 'Яйцо', patch: { kcal: 80, n: { p: 13 } } }]);
    expect(plan.toCreate.map((i) => i.name)).toEqual(['Сыр']);
  });

  it('existing ingredient without changes lands in unchanged', () => {
    const payload = parsePayload('{"v":1,"type":"catalog","ingredients":[{"name":"Яйцо","mode":"perPiece","kcal":78}]}');
    const { plan } = buildImportPlan(payload, db);
    expect(plan.unchanged).toEqual(['Яйцо']);
    expect(plan.toUpdate).toEqual([]);
  });
});
