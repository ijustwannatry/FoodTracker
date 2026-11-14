import { describe, it, expect } from 'vitest';
import { serializeRecipe, serializeCatalog, parsePayload } from '../src/domain/exchange.js';
import { MODES } from '../src/domain/constants.js';

describe('recipe payload format (spec section 5)', () => {
  const canonical = '{"v":1,"type":"recipe","name":"Омлет","items":[["Яйцо",3,"pc",78],["Молоко",50,"ml",52,{"p":2.9,"f":3.3,"c":4.7}]],"portions":1,"weight":null,"text":"Взбить, жарить 5 минут"}';

  it('parses the canonical example', () => {
    const p = parsePayload(canonical);
    expect(p.type).toBe('recipe');
    expect(p.name).toBe('Омлет');
    expect(p.items[0]).toEqual({ name: 'Яйцо', qty: 3, unit: 'pc', kcal: 78, n: null });
    expect(p.items[1].n).toEqual({ p: 2.9, f: 3.3, c: 4.7 });
    expect(p.portions).toBe(1);
    expect(p.weight).toBeNull();
    expect(p.text).toBe('Взбить, жарить 5 минут');
  });

  it('round-trips: serialize -> parse keeps all data', () => {
    const recipe = {
      name: 'Омлет',
      items: [
        { ingredient: { name: 'Яйцо', mode: MODES.PER_PIECE, kcal: 78, n: { p: 12.7, f: 10.6, c: 0.7 } }, qty: 3, unit: 'pc' },
        { ingredient: { name: 'Молоко', mode: MODES.PER_100G, kcal: 52, n: {} }, qty: 50, unit: 'ml' }
      ],
      portions: 1,
      weight: null,
      text: 'Взбить, жарить 5 минут'
    };
    const json = serializeRecipe(recipe);
    const back = parsePayload(json);
    expect(back.name).toBe('Омлет');
    expect(back.items.length).toBe(2);
    expect(back.items[0]).toEqual({ name: 'Яйцо', qty: 3, unit: 'pc', kcal: 78, n: { p: 12.7, f: 10.6, c: 0.7 } });
    expect(back.items[1]).toEqual({ name: 'Молоко', qty: 50, unit: 'ml', kcal: 52, n: null });
    expect(back.portions).toBe(1);
    expect(back.weight).toBeNull();
    // Re-export of parsed data equals first export (stable round trip).
    const recipe2 = {
      name: back.name,
      items: back.items.map((r) => ({ ingredient: { name: r.name, kcal: r.kcal, n: r.n }, qty: r.qty, unit: r.unit })),
      portions: back.portions,
      weight: back.weight,
      text: back.text
    };
    expect(parsePayload(serializeRecipe(recipe2))).toEqual(back);
  });

  it('accepts zero values (water)', () => {
    const p = parsePayload('{"v":1,"type":"recipe","name":"Суп","items":[["Вода",250,"ml",0]],"portions":0,"weight":0,"text":""}');
    expect(p.items[0].kcal).toBe(0);
    expect(p.portions).toBe(0);
    expect(p.weight).toBe(0);
  });

  it('keeps unknown nutrient keys (extensible structure)', () => {
    const p = parsePayload('{"v":1,"type":"recipe","name":"X","items":[["A",1,"g",1,{"salt":0.5}]],"portions":null,"weight":null,"text":""}');
    expect(p.items[0].n).toEqual({ salt: 0.5 });
  });

  it('rejects invalid JSON / version / type with human errors', () => {
    expect(() => parsePayload('not a json')).toThrow(/JSON/);
    expect(() => parsePayload('{"v":2,"type":"recipe","name":"x","items":[]}')).toThrow(/версия/i);
    expect(() => parsePayload('{"v":1,"type":"magic","name":"x"}')).toThrow(/тип/i);
    expect(() => parsePayload('[]')).toThrow();
  });

  it('rejects negative / non-finite numbers inside payload', () => {
    expect(() => parsePayload('{"v":1,"type":"recipe","name":"x","items":[["A",-1,"g",10]]}')).toThrow();
    expect(() => parsePayload('{"v":1,"type":"recipe","name":"x","items":[["A",1,"g","many"]]}')).toThrow();
    expect(() => parsePayload('{"v":1,"type":"recipe","name":"x","items":[["A",1,"kg",10]]}')).toThrow(/единиц/);
  });
});

describe('catalog payload format', () => {
  it('serializes and parses a single ingredient', () => {
    const json = serializeCatalog([{ name: 'Яйцо', mode: MODES.PER_PIECE, kcal: 78, n: { p: 12.7, f: 10.6, c: 0.7 } }]);
    expect(JSON.parse(json)).toEqual({
      v: 1,
      type: 'catalog',
      ingredients: [{ name: 'Яйцо', mode: 'perPiece', kcal: 78, n: { p: 12.7, f: 10.6, c: 0.7 } }]
    });
    const p = parsePayload(json);
    expect(p.ingredients[0].name).toBe('Яйцо');
  });

  it('omits empty nutrients object', () => {
    const json = serializeCatalog([{ name: 'Вода', mode: MODES.PER_100G, kcal: 0, n: {} }]);
    expect(json).not.toContain('"n"');
  });

  it('round-trip catalog', () => {
    const list = [
      { name: 'Вода', mode: MODES.PER_100G, kcal: 0, n: null },
      { name: 'Соль', mode: MODES.PER_100G, kcal: 0, n: { p: 0, f: 0, c: 0 } }
    ];
    expect(parsePayload(serializeCatalog(list)).ingredients).toEqual([
      { name: 'Вода', mode: 'per100g', kcal: 0, n: null },
      { name: 'Соль', mode: 'per100g', kcal: 0, n: { p: 0, f: 0, c: 0 } }
    ]);
  });
});
