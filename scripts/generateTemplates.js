const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const dir = path.join(process.cwd(), 'public', 'templates');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// 1. Purchase Orders Sheet Sample Data
const poHeaders = [
  'ORDER NO.',
  'ORDER DATE',
  'SUPPLIER',
  'ORIGIN',
  'ITEM NO.',
  'GRADE',
  'SECTION',
  'DIA/W',
  'T',
  'LENGTH',
  'TREATMENT',
  'surface condition',
  'OR. QTY.',
  'PRICE',
  'CURRENCY',
  'DESTINATION',
  'CUSTOMER',
  'TERMS',
  'PAYMENT',
  'CONTRACT DELIVERY DATE',
  'REFRENCE',
  'O/C NO',
  'LOT No.',
  'REMARKS'
];

const poRows = [
  [
    'PO-2026-001',
    '2026-02-15',
    'HKG Trading Co. Ltd',
    'Sanyo',
    1,
    'QC-11',
    'Round',
    214,
    0,
    5800,
    'Annealed',
    'BRIGHT ROLLED',
    4000,
    3000,
    'USD',
    'Nhava Sheva',
    'SE',
    'FOB',
    'DP at sight',
    '2026-05-30',
    'Sandeep',
    'S0618669',
    'LOT-2026-01',
    'Urgent industrial delivery'
  ],
  [
    'PO-2026-001',
    '2026-02-15',
    'HKG Trading Co. Ltd',
    'Sanyo',
    2,
    '304',
    'Flat',
    150,
    25,
    6000,
    'Annealed',
    'PEELED',
    2500,
    3200,
    'USD',
    'Nhava Sheva',
    'SE',
    'FOB',
    'DP at sight',
    '2026-05-30',
    'Sandeep',
    'S0618669',
    'LOT-2026-02',
    'Standard quality'
  ],
  [
    'PO-2026-002',
    '2026-03-01',
    'Yongxing Special Materials',
    'Tsingshan',
    1,
    '316L',
    'Round',
    180,
    0,
    6000,
    'Solution Annealed',
    'BLACK FORGED',
    6000,
    3800,
    'USD',
    'Mundra',
    'Omkara Steels Pvt Ltd',
    'CIF',
    'LC 90 days',
    '2026-06-15',
    'Nitin',
    'OC-99214',
    '',
    'Direct customer allocation'
  ]
];

// 2. Receipts Sheet Sample Data
const rcHeaders = [
  'ORDER NO.',
  'ITEM NO.',
  'RECD. QTY.',
  'LOT NO.',
  'INV NO.',
  'INV DATE',
  'CONTAINER NO.',
  'PORT OF LOADING',
  'WAREHOUSE LOCATION',
  'REMARKS'
];

const rcRows = [
  [
    'PO-2026-001',
    1,
    2250,
    'LOT-2026-01',
    'INV-B0618669-1',
    '2026-05-10',
    'MSCU1234567',
    'Shanghai',
    'Nhava Sheva Yard',
    'Partial cargo cleared at customs'
  ],
  [
    'PO-2026-001',
    2,
    2500,
    'LOT-2026-02',
    'INV-B0618669-2',
    '2026-05-12',
    'MSCU9876543',
    'Shanghai',
    'Main Warehouse Yard',
    'Full shipment received in good order'
  ]
];

// 3. Incoming Stock Sheet Sample Data
const incHeaders = [
  'LOT',
  'Supplier',
  'Make',
  'Grade',
  'Condition',
  'DIA/W',
  'T',
  'L',
  'pc',
  'Weight',
  'customer',
  'Port',
  'Date of Shipment',
  'ETA (sea port)',
  'RECEIVED',
  'HEAT NO',
  'SIMS',
  'CONTAINER NO',
  'DEL TERMS',
  'PAYMENT TERMS',
  'ORDER NO.'
];

const incRows = [
  [
    'LOT-2026-01',
    'HKG Trading Co. Ltd',
    'Sanyo',
    'QC-11',
    'BRIGHT ROLLED',
    214,
    0,
    5800,
    14,
    4000,
    'SE',
    'Nhava Sheva',
    '2026-04-10',
    '2026-05-05',
    'IN_TRANSIT',
    'H-882194',
    'SIMS-99201',
    'MSCU1234567',
    'FOB',
    'DP at sight',
    'PO-2026-001'
  ],
  [
    'SE-CARGO-102',
    'Yongxing Special Materials',
    'Tsingshan',
    '316L',
    'BLACK FORGED',
    180,
    0,
    6000,
    20,
    6000,
    'Omkara Steels',
    'Mundra',
    '2026-04-20',
    '2026-05-25',
    'IN_TRANSIT',
    'HT-55421',
    'SIMS-99441',
    'TGHU7749102',
    'CIF',
    'LC 90 days',
    'PO-2026-002'
  ]
];

// Create Unified Excel Workbook
const wb = xlsx.utils.book_new();

const ws1 = xlsx.utils.aoa_to_sheet([poHeaders, ...poRows]);
ws1['!cols'] = poHeaders.map(() => ({ wch: 18 }));
xlsx.utils.book_append_sheet(wb, ws1, '1_Purchase_Orders');

const ws2 = xlsx.utils.aoa_to_sheet([rcHeaders, ...rcRows]);
ws2['!cols'] = rcHeaders.map(() => ({ wch: 18 }));
xlsx.utils.book_append_sheet(wb, ws2, '2_Receipts');

const ws3 = xlsx.utils.aoa_to_sheet([incHeaders, ...incRows]);
ws3['!cols'] = incHeaders.map(() => ({ wch: 18 }));
xlsx.utils.book_append_sheet(wb, ws3, '3_Incoming_Stock');

const excelPath = path.join(dir, 'Sandeep_Edgetech_Bulk_Upload_Template.xlsx');
xlsx.writeFile(wb, excelPath);
console.log('Generated Excel Template:', excelPath);

// Generate Individual CSV Files
function writeCsv(filename, headers, rows) {
  const content = [
    headers.map(h => `"${h}"`).join(','),
    ...rows.map(r => r.map(c => `"${c !== null && c !== undefined ? c : ''}"`).join(','))
  ].join('\n');
  const target = path.join(dir, filename);
  fs.writeFileSync(target, content, 'utf8');
  console.log('Generated CSV Template:', target);
}

writeCsv('1_Purchase_Orders_Template.csv', poHeaders, poRows);
writeCsv('2_Receipts_Template.csv', rcHeaders, rcRows);
writeCsv('3_Incoming_Stock_Template.csv', incHeaders, incRows);
