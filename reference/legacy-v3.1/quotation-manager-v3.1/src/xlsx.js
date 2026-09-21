/* 受限的 XLSX 写出适配器。仅生成本项目的表格、样式、SUM 合计和模板校验。
 * 不读取外部 Excel，不执行任意公式，不加载外部资源。ZIP 使用 STORE，保持零依赖。
 * OOXML 包结构参考 Microsoft Learn：structure-of-a-spreadsheetml-document。
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports)
        module.exports = api;
    else
        root.QuoteXlsx = api;
})(globalThis, function () {
    'use strict';
    const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const enc = new TextEncoder();
    function xml(value) {
        return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
            .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
    }
    const textXML = value => xml(String(value).replace(/_x[\da-f]{4}_/gi, m => `_x005F_${m.slice(1)}`));
    function letter(index) {
        let value = index + 1, text = '';
        while (value > 0) {
            value--;
            text = String.fromCharCode(65 + value % 26) + text;
            value = Math.floor(value / 26);
        }
        return text;
    }
    function excelDate(value) {
        const ms = Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
        return (ms - Date.UTC(1899, 11, 31)) / 86400000 + (ms >= Date.UTC(1900, 2, 1) ? 1 : 0);
    }
    const argb = color => 'FF' + (/^#[\da-f]{6}$/i.test(color || '') ? color.slice(1).toUpperCase() : '334155');
    function styleRegistry() {
        const values = [], indexes = new Map();
        const add = (s = {}) => {
            const value = { font: s.font || 'Microsoft YaHei', size: s.size || 10.5, color: s.color || '#334155', bold: !!s.bold,
                align: ['left', 'center', 'right'].includes(s.align) ? s.align : 'left', wrap: !!s.wrap,
                fill: s.fill || '', format: s.format || 'General', border: s.border !== false };
            const key = JSON.stringify(value);
            if (!indexes.has(key)) {
                indexes.set(key, values.length);
                values.push(value);
            }
            return indexes.get(key);
        };
        add();
        const render = () => {
            const formats = [...new Set(values.map(s => s.format).filter(s => s !== 'General'))];
            const fills = [...new Set(values.map(s => s.fill).filter(Boolean))];
            return XML + `<styleSheet xmlns="${NS}">` +
                `<numFmts count="${formats.length}">${formats.map((s, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xml(s)}"/>`).join('')}</numFmts>` +
                `<fonts count="${values.length}">${values.map(s => `<font><sz val="${s.size}"/><color rgb="${argb(s.color)}"/><name val="${xml(s.font)}"/>${s.bold ? '<b/>' : ''}</font>`).join('')}</fonts>` +
                `<fills count="${fills.length + 2}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fills.map(s => `<fill><patternFill patternType="solid"><fgColor rgb="${argb(s)}"/><bgColor indexed="64"/></patternFill></fill>`).join('')}</fills>` +
                '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="hair"><color rgb="FFE2E8F0"/></bottom><diagonal/></border></borders>' +
                '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
                `<cellXfs count="${values.length}">${values.map((s, i) => `<xf numFmtId="${s.format === 'General' ? 0 : 164 + formats.indexOf(s.format)}" fontId="${i}" fillId="${s.fill ? 2 + fills.indexOf(s.fill) : 0}" borderId="${s.border ? 1 : 0}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyNumberFormat="1"><alignment horizontal="${s.align}" vertical="center" wrapText="${s.wrap ? 1 : 0}"/></xf>`).join('')}</cellXfs>` +
                '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
        };
        return { add, render };
    }
    function sheetXML(sheet, styles) {
        if (!Array.isArray(sheet.rows) || sheet.rows.length > 11000 || !Array.isArray(sheet.columns) || sheet.columns.length > 100)
            throw new Error('工作表超出当前导出范围。');
        const end = `${letter(Math.max(0, sheet.columns.length - 1))}${Math.max(1, sheet.rows.length)}`;
        const data = sheet.rows.map((row, r) => {
            const cells = row.map((raw, c) => {
                const cell = raw && typeof raw === 'object' && !(raw instanceof Date) ? raw : { value: raw };
                const style = styles.add(cell.style), ref = `${letter(c)}${r + 1}`, value = cell.value;
                if (cell.formula) {
                    if (!/^SUM\([A-Z]+\d+:[A-Z]+\d+\)$/.test(cell.formula) || !Number.isFinite(value))
                        throw new Error('不支持此导出公式。');
                    return `<c r="${ref}" s="${style}"><f>${cell.formula}</f><v>${value}</v></c>`;
                }
                if (value === null || value === undefined || value === '')
                    return `<c r="${ref}" s="${style}"/>`;
                if (value instanceof Date)
                    return `<c r="${ref}" s="${style}" t="n"><v>${excelDate(value)}</v></c>`;
                if (typeof value === 'number') {
                    if (!Number.isFinite(value))
                        throw new Error('导出数据含无效数值。');
                    return `<c r="${ref}" s="${style}" t="n"><v>${value}</v></c>`;
                }
                return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${textXML(String(value).slice(0, 32767))}</t></is></c>`;
            }).join('');
            return `<row r="${r + 1}" ht="${r === 0 ? 28 : sheet.rowHeight || 24}" customHeight="1">${cells}</row>`;
        }).join('');
        const validations = sheet.validations || [];
        return XML + `<worksheet xmlns="${NS}"><dimension ref="A1:${end}"/><sheetViews><sheetView workbookViewId="0">` +
            (sheet.freeze !== false ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' : '') +
            '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="24"/>' +
            `<cols>${sheet.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(64, Math.max(8, c.width || 20))}" customWidth="1"/>`).join('')}</cols>` +
            `<sheetData>${data}</sheetData>` +
            (sheet.filterEnd ? `<autoFilter ref="A1:${letter(sheet.columns.length - 1)}${sheet.filterEnd}"/>` : '') +
            (validations.length ? `<dataValidations count="${validations.length}">${validations.map(v => `<dataValidation type="${v.type === 'list' ? 'list' : 'decimal'}"${v.type === 'list' ? '' : ' operator="between"'} allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="输入有误" error="${xml(v.error || '请按填写说明输入。')}" sqref="${xml(v.range)}"><formula1>${xml(v.formula1)}</formula1>${v.formula2 !== undefined ? `<formula2>${xml(v.formula2)}</formula2>` : ''}</dataValidation>`).join('')}</dataValidations>` : '') +
            '<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>';
    }
    const crcTable = Array.from({ length: 256 }, (_, n) => {
        let c = n;
        for (let i = 0; i < 8; i++)
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
    });
    function crc32(bytes) {
        let crc = 0xffffffff;
        for (const b of bytes)
            crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
        return (crc ^ 0xffffffff) >>> 0;
    }
    function zip(files) {
        const local = [], central = [];
        let offset = 0;
        for (const [name, text] of Object.entries(files)) {
            const filename = enc.encode(name), body = enc.encode(text), crc = crc32(body);
            const head = new Uint8Array(30 + filename.length), h = new DataView(head.buffer);
            h.setUint32(0, 0x04034b50, true);
            h.setUint16(4, 20, true);
            h.setUint16(6, 0x800, true);
            h.setUint16(12, 33, true);
            h.setUint32(14, crc, true);
            h.setUint32(18, body.length, true);
            h.setUint32(22, body.length, true);
            h.setUint16(26, filename.length, true);
            head.set(filename, 30);
            const cd = new Uint8Array(46 + filename.length), v = new DataView(cd.buffer);
            v.setUint32(0, 0x02014b50, true);
            v.setUint16(4, 20, true);
            v.setUint16(6, 20, true);
            v.setUint16(8, 0x800, true);
            v.setUint16(14, 33, true);
            v.setUint32(16, crc, true);
            v.setUint32(20, body.length, true);
            v.setUint32(24, body.length, true);
            v.setUint16(28, filename.length, true);
            v.setUint32(42, offset, true);
            cd.set(filename, 46);
            local.push(head, body);
            central.push(cd);
            offset += head.length + body.length;
        }
        const size = central.reduce((sum, b) => sum + b.length, 0), end = new Uint8Array(22), e = new DataView(end.buffer);
        e.setUint32(0, 0x06054b50, true);
        e.setUint16(8, central.length, true);
        e.setUint16(10, central.length, true);
        e.setUint32(12, size, true);
        e.setUint32(16, offset, true);
        const output = new Uint8Array(offset + size + 22);
        let pos = 0;
        for (const b of [...local, ...central, end]) {
            output.set(b, pos);
            pos += b.length;
        }
        return output;
    }
    function write(book) {
        const sheets = book?.sheets;
        if (!Array.isArray(sheets) || !sheets.length || sheets.length > 10)
            throw new Error('导出工作簿格式不正确。');
        const names = new Set();
        for (const s of sheets) {
            if (!s.name || s.name.length > 31 || /[\\/?*\[\]:]/.test(s.name) || names.has(s.name))
                throw new Error('工作表名称不正确。');
            names.add(s.name);
        }
        const styles = styleRegistry(), files = {};
        sheets.forEach((s, i) => files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXML(s, styles));
        files['xl/styles.xml'] = styles.render();
        files['[Content_Types].xml'] = XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>';
        files['_rels/.rels'] = XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
        files['xl/workbook.xml'] = XML + `<workbook xmlns="${NS}" xmlns:r="${REL}"><workbookPr date1904="0"/><bookViews><workbookView/></bookViews><sheets>` + sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
        files['xl/_rels/workbook.xml.rels'] = XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + `<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`;
        return zip(files);
    }
    return Object.freeze({ write, letter, excelDate, MIME: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
});
