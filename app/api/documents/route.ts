import { NextResponse } from 'next/server';
import { listFilenames } from '@/lib/vector';

export async function GET() {
  try {
    const filenames = await listFilenames();
    return NextResponse.json({ filenames });
  } catch {
    return NextResponse.json({ error: 'Failed to list documents.' }, { status: 500 });
  }
}
