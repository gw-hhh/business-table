'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = fs.existsSync(path.join(__dirname, '../src/repository.js')) ? require('../src/repository.js') : {};
class Storage {
    constructor() {
        this.map = new Map();
        this.fail = false;
    }
    getItem(k) {
        return this.map.get(k) ?? null;
    }
    setItem(k, v) {
        if (this.fail)
            throw new Error('quota');
        this.map.set(k, v);
    }
}
test('仓库接口已实现', () => assert.equal(typeof R.LocalRepository, 'function'));
test('删除后查询、刷新和重新创建仓库均不会复活', () => {
    const storage = new Storage();
    const r = new R.LocalRepository({ storage });
    const id = r.list()[0].id;
    r.remove([id]);
    assert.equal(r.list().some(x => x.id === id), false);
    assert.equal(r.list(true).some(x => x.id === id), false);
    assert.equal(new R.LocalRepository({ storage }).list().some(x => x.id === id), false);
});
test('仓库返回副本，列表渲染不能修改原数据', () => {
    const r = new R.LocalRepository({ storage: new Storage() });
    const a = r.list();
    a[0].name = '外部改动';
    assert.notEqual(r.list()[0].name, '外部改动');
});
test('缓存损坏进入临时模式且不覆盖损坏内容', () => {
    const s = new Storage();
    s.setItem('quotation-demo:data:v1', '{broken');
    const r = new R.LocalRepository({ storage: s });
    assert.equal(r.list().length, 6);
    assert.equal(r.isTemporary, true);
    assert.equal(s.getItem('quotation-demo:data:v1'), '{broken');
});
test('写入失败时仓库记录不变', () => {
    const s = new Storage();
    const r = new R.LocalRepository({ storage: s });
    const rows = r.list();
    s.fail = true;
    assert.throws(() => r.remove([rows[0].id]));
    assert.equal(r.list().length, 6);
});
test('其他标签页更新后拒绝使用过期记录覆盖', () => {
    const s = new Storage();
    const a = new R.LocalRepository({ storage: s });
    const b = new R.LocalRepository({ storage: s });
    const [first, second] = a.list();
    b.list();
    b.remove([first.id]);
    assert.throws(() => a.remove([second.id]), /刷新/);
    assert.equal(a.list(true).length, 5);
});
test('编辑版本过期时拒绝覆盖', () => {
    const r = new R.LocalRepository({ storage: new Storage() });
    const item = r.list()[0];
    r.update(item.id, { ...item, name: '新项目' }, item.version);
    assert.throws(() => r.update(item.id, item, item.version), /修改/);
});
test('缺少本地存储仍可在当前会话操作', () => {
    const r = new R.LocalRepository({ storage: null });
    const items = r.list();
    r.remove([items[0].id]);
    assert.equal(r.list().length, 5);
    assert.equal(r.isTemporary, true);
});
test('导入重复编号或非法记录时整批不写入', () => {
    const r = new R.LocalRepository({ storage: new Storage() });
    const items = r.list();
    assert.throws(() => r.replace([items[0], items[0]]));
    assert.equal(r.list().length, 6);
});
test('首次写入被浏览器拒绝时降级而不是白屏', () => {
    const s = new Storage();
    s.fail = true;
    const r = new R.LocalRepository({ storage: s });
    assert.equal(r.list().length, 6);
    assert.equal(r.isTemporary, true);
    r.remove([r.list()[0].id]);
    assert.equal(r.list().length, 5);
});
test('重新加载时存储已清除且写入失败，保留原仓库快照', () => {
    const s = new Storage();
    const r = new R.LocalRepository({ storage: s });
    const items = r.list();
    r.remove([items[0].id]);
    const before = r.list();
    s.map.clear();
    s.fail = true;
    assert.throws(() => r.list(true), /读取/);
    assert.deepEqual(r.list(), before);
});
