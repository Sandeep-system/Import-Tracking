const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

console.log('Loading old and new sheets...');
const wbStockOld = xlsx.readFile('INCOMING STOCK.xlsx', { cellDates: true });
const wbStockNew = xlsx.readFile('INCOMING STOCK - Copy (2).xlsx', { cellDates: true });
const wbPendingOld = xlsx.readFile('Import Pending New.xlsx', { cellDates: true });
const wbPendingNew = xlsx.readFile('Import Pending New - Copy (2).xlsx', { cellDates: true });

const results = {};

// 1. INCOMING SE & INCOMING CLOSE analysis
console.log('Analyzing INCOMING SE & CLOSE...');
const seOld = wbStockOld.Sheets['INCOMING SE'];
const seNew = wbStockNew.Sheets['INCOMING SE'];
const rSeOld = xlsx.utils.decode_range(seOld['!ref'] || 'A1');
const rSeNew = xlsx.utils.decode_range(seNew['!ref'] || 'A1');

const closeOld = wbStockOld.Sheets['INCOMING CLOSE'];
const closeNew = wbStockNew.Sheets['INCOMING CLOSE'];
const rCloseOld = xlsx.utils.decode_range(closeOld['!ref'] || 'A1');
const rCloseNew = xlsx.utils.decode_range(closeNew['!ref'] || 'A1');

const lotsSeOld = new Set();
const lotsSeNew = new Set();
for (let r = 2; r <= rSeOld.e.r; r++) {
  const lot = seOld[xlsx.utils.encode_cell({r, c: 2})]?.v;
  if (lot) lotsSeOld.add(String(lot).trim());
}
for (let r = 2; r <= rSeNew.e.r; r++) {
  const lot = seNew[xlsx.utils.encode_cell({r, c: 2})]?.v;
  if (lot) lotsSeNew.add(String(lot).trim());
}

const lotsCloseOld = new Set();
const lotsCloseNew = new Set();
for (let r = 2; r <= rCloseOld.e.r; r++) {
  const lot = closeOld[xlsx.utils.encode_cell({r, c: 2})]?.v;
  if (lot) lotsCloseOld.add(String(lot).trim());
}
for (let r = 2; r <= rCloseNew.e.r; r++) {
  const lot = closeNew[xlsx.utils.encode_cell({r, c: 2})]?.v;
  if (lot) lotsCloseNew.add(String(lot).trim());
}

const seAddedLots = [...lotsSeNew].filter(x => !lotsSeOld.has(x));
const seRemovedLots = [...lotsSeOld].filter(x => !lotsSeNew.has(x));
const closeAddedLots = [...lotsCloseNew].filter(x => !lotsCloseOld.has(x));
const closeRemovedLots = [...lotsCloseOld].filter(x => !lotsCloseNew.has(x));

// Check if removed from SE went into Close
const seMovedToClose = seRemovedLots.map(lot => ({
  lot,
  inNewClose: lotsCloseNew.has(lot),
  inOldClose: lotsCloseOld.has(lot)
}));

results.incomingStock = {
  se: {
    oldLotsCount: lotsSeOld.size,
    newLotsCount: lotsSeNew.size,
    addedLots: seAddedLots,
    removedLots: seRemovedLots,
    seMovedToClose
  },
  close: {
    oldRowCount: rCloseOld.e.r + 1,
    newRowCount: rCloseNew.e.r + 1,
    oldLotsCount: lotsCloseOld.size,
    newLotsCount: lotsCloseNew.size,
    addedLots: closeAddedLots,
    removedLots: closeRemovedLots
  }
};

// Inspect added rows in INCOMING CLOSE
const newCloseRows = [];
for (let r = rCloseOld.e.r + 1; r <= rCloseNew.e.r; r++) {
  let rowData = {};
  for (let c = 0; c <= 20; c++) {
    const v = closeNew[xlsx.utils.encode_cell({r, c})]?.v;
    if (v !== undefined) {
      const header = closeNew[xlsx.utils.encode_cell({r: 1, c})]?.v || ('col_' + c);
      rowData[header] = v instanceof Date ? v.toISOString().split('T')[0] : v;
    }
  }
  if (Object.keys(rowData).length > 0) {
    newCloseRows.push({ row: r + 1, data: rowData });
  }
}
results.incomingStock.newCloseRows = newCloseRows;

// 2. Evershine IC analysis
console.log('Analyzing evershine ic...');
const wsEver = wbStockNew.Sheets['evershine ic'];
if (wsEver) {
  const rEver = xlsx.utils.decode_range(wsEver['!ref'] || 'A1');
  const headers = [];
  for (let c = 0; c <= rEver.e.c; c++) {
    const h = wsEver[xlsx.utils.encode_cell({r: 0, c})]?.v;
    headers.push(h);
  }
  const sample = [];
  for (let r = 1; r <= Math.min(5, rEver.e.r); r++) {
    let row = {};
    for (let c = 0; c <= Math.min(15, rEver.e.c); c++) {
      row[headers[c] || ('col_' + c)] = wsEver[xlsx.utils.encode_cell({r, c})]?.v;
    }
    sample.push(row);
  }
  results.evershineIc = {
    rowCount: rEver.e.r + 1,
    colCount: rEver.e.c + 1,
    headers: headers.filter(Boolean),
    sample
  };
}

// 3. Pending Order analysis
console.log('Analyzing Pending Order...');
const pOld = wbPendingOld.Sheets['Pending Order'];
const pNew = wbPendingNew.Sheets['Pending Order'];
const rPOld = xlsx.utils.decode_range(pOld['!ref'] || 'A1');
const rPNew = xlsx.utils.decode_range(pNew['!ref'] || 'A1');

function getPOs(sheet, range) {
  const map = new Map();
  for (let r = 2; r <= range.e.r; r++) {
    const orderNo = sheet[xlsx.utils.encode_cell({r, c: 1})]?.v;
    if (!orderNo || String(orderNo).toLowerCase().includes('total')) continue;
    const poNum = String(orderNo).trim();
    if (!map.has(poNum)) map.set(poNum, []);
    
    let row = { rowIdx: r + 1 };
    for (let c = 0; c <= 35; c++) {
      const h = sheet[xlsx.utils.encode_cell({r: 1, c})]?.v || ('col_' + c);
      let val = sheet[xlsx.utils.encode_cell({r, c})]?.v;
      if (val instanceof Date) val = val.toISOString().split('T')[0];
      row[h] = val;
    }
    map.get(poNum).push(row);
  }
  return map;
}

const posOld = getPOs(pOld, rPOld);
const posNew = getPOs(pNew, rPNew);

const addedPOs = [...posNew.keys()].filter(k => !posOld.has(k));
const removedPOs = [...posOld.keys()].filter(k => !posNew.has(k));
const commonPOs = [...posOld.keys()].filter(k => posNew.has(k));

const modifiedPOs = [];
for (const poNum of commonPOs) {
  const oldItems = posOld.get(poNum);
  const newItems = posNew.get(poNum);
  
  let diffs = [];
  if (oldItems.length !== newItems.length) {
    diffs.push({ type: 'item_count_changed', old: oldItems.length, new: newItems.length });
  }
  
  for (let i = 0; i < Math.max(oldItems.length, newItems.length); i++) {
    const o = oldItems[i];
    const n = newItems[i];
    if (!o) {
      diffs.push({ type: 'line_added', line: i + 1, new: n });
    } else if (!n) {
      diffs.push({ type: 'line_removed', line: i + 1, old: o });
    } else {
      let fieldDiffs = {};
      const keys = new Set([...Object.keys(o), ...Object.keys(n)]);
      for (const k of keys) {
        if (k === 'rowIdx') continue;
        if (String(o[k] ?? '') !== String(n[k] ?? '')) {
          fieldDiffs[k] = { old: o[k], new: n[k] };
        }
      }
      if (Object.keys(fieldDiffs).length > 0) {
        diffs.push({ type: 'line_modified', line: i + 1, diffs: fieldDiffs });
      }
    }
  }
  
  if (diffs.length > 0) {
    modifiedPOs.push({ poNumber: poNum, diffs });
  }
}

// Details of added POs
const addedPoDetails = addedPOs.map(poNum => {
  const items = posNew.get(poNum);
  return {
    poNumber: poNum,
    supplier: items[0]?.SUPPLIER,
    customer: items[0]?.CUSTOMER,
    itemCount: items.length,
    items: items.map(it => ({
      grade: it.GRADE,
      dim: `${it['DIA/W'] || it.t || ''}x${it.t || ''}x${it.LENGTH || ''}`,
      orderQty: it['OR. QTY.'],
      recdQty: it['RECD. QTY.'],
      balQty: it['BAL. QTY.'],
      lot: it['LOT NO.'],
      close: it.Close
    }))
  };
});

// Check where removed POs went (did they move to Closed Order?)
const cOld = wbPendingOld.Sheets['Closed Order'];
const cNew = wbPendingNew.Sheets['Closed Order'];
const rCOld = xlsx.utils.decode_range(cOld['!ref'] || 'A1');
const rCNew = xlsx.utils.decode_range(cNew['!ref'] || 'A1');

const closedPosOld = new Set();
const closedPosNew = new Set();
for (let r = 2; r <= rCOld.e.r; r++) {
  const po = cOld[xlsx.utils.encode_cell({r, c: 1})]?.v;
  if (po) closedPosOld.add(String(po).trim());
}
for (let r = 2; r <= rCNew.e.r; r++) {
  const po = cNew[xlsx.utils.encode_cell({r, c: 1})]?.v;
  if (po) closedPosNew.add(String(po).trim());
}

const removedPoStatus = removedPOs.map(po => ({
  poNumber: po,
  inNewClosed: closedPosNew.has(po),
  inOldClosed: closedPosOld.has(po)
}));

results.pendingOrders = {
  oldPOCount: posOld.size,
  newPOCount: posNew.size,
  addedPOs,
  addedPoDetails,
  removedPOs,
  removedPoStatus,
  modifiedPOsCount: modifiedPOs.length,
  modifiedPOs
};

// 4. Closed Order changes
const newlyClosedPOs = [...closedPosNew].filter(x => !closedPosOld.has(x));
results.closedOrders = {
  oldRowCount: rCOld.e.r + 1,
  newRowCount: rCNew.e.r + 1,
  oldPoCount: closedPosOld.size,
  newPoCount: closedPosNew.size,
  newlyClosedPOs
};

// 5. Inspect extra sheets in Pending file (Sheet1, Sheet2, Sheet3)
results.extraSheets = {};
for (const sName of ['Sheet1', 'Sheet2', 'Sheet3']) {
  const ws = wbPendingNew.Sheets[sName];
  if (ws && ws['!ref']) {
    const r = xlsx.utils.decode_range(ws['!ref']);
    const rows = [];
    for (let ri = r.s.r; ri <= Math.min(r.s.r + 5, r.e.r); ri++) {
      let row = [];
      for (let ci = r.s.c; ci <= Math.min(r.s.c + 10, r.e.c); ci++) {
        row.push(ws[xlsx.utils.encode_cell({r: ri, c: ci})]?.v);
      }
      rows.push(row);
    }
    results.extraSheets[sName] = {
      ref: ws['!ref'],
      rowsCount: r.e.r - r.s.r + 1,
      sampleRows: rows
    };
  }
}

fs.writeFileSync('scripts/comparison_results.json', JSON.stringify(results, null, 2));
console.log('Comparison complete! Output saved to scripts/comparison_results.json');
