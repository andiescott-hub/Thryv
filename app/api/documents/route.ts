import { NextResponse } from 'next/server';
import { listFilenames, deleteByFilename } from '@/lib/vector';

export async function GET() {
  try {
    const filenames = await listFilenames();
    return NextResponse.json({ filenames });
  } catch {
    return NextResponse.json({ error: 'Failed to list documents.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { filename } = await req.json();
    if (!filename || typeof filename !== 'string') {
      return NextResponse.json({ error: 'filename is required.' }, { status: 400 });
    }
    await deleteByFilename(filename);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete document.' }, { status: 500 });
  }
}
