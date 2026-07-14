import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { userDB, authenticatorDB } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { getAndDeleteChallenge } from '@/lib/challenge-store';

const rpID = process.env.RP_ID ?? 'localhost';
const origin = process.env.NEXT_PUBLIC_ORIGIN ?? 'http://localhost:3000';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { username, response } = body;

  if (!username || !response) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const expectedChallenge = getAndDeleteChallenge(`register:${username}`);
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'Challenge expired or not found. Please try again.' }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }

  const { verified, registrationInfo } = verification;
  if (!verified || !registrationInfo) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }

  const { credential } = registrationInfo;

  let user = userDB.findByUsername(username);
  if (!user) {
    user = userDB.create(username);
  }

  authenticatorDB.create({
    userId: user.id,
    credentialId: credential.id,
    credentialPublicKey: Buffer.from(credential.publicKey),
    counter: credential.counter ?? 0,
  });

  await createSession({ userId: user.id, username: user.username });

  return NextResponse.json({ verified: true });
}
