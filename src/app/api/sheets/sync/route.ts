import { NextResponse } from 'next/server';

const GOOGLE_SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyDrEcj9bW9EDs7Gx_9nMru76YMELyodpNW-68EPh5VC7NwiibCyD1UfmWDi2mIIHWg/exec';

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });

    const data = await response.json();
    return NextResponse.json({ success: true, result: data });
  } catch (error: any) {
    console.error('Error syncing with Google Sheets:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to sync with Google Sheets' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'connected',
    webhookUrl: GOOGLE_SHEETS_WEBHOOK_URL
  });
}
