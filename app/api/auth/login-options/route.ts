import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { userDB, authenticatorDB } from '@/lib/db';
import { setChallenge } from '@/lib/challenge-store';

const rpID = process.env.RP_ID ?? 'localhost';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const username = typeof body.username === 'string' ? body.username.trim() : '';

  if (!username) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  const user = userDB.findByUsername(username);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const authenticators = authenticatorDB.findByUserId(user.id);
  if (authenticators.length === 0) {
    return NextResponse.json({ error: 'No authenticators registered for this user' }, { status: 404 });
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: authenticators.map((auth) => ({ id: auth.credential_id })),
    userVerification: 'preferred',
  });

  setChallenge(`login:${username}`, options.challenge);

  return NextResponse.json(options);
}
