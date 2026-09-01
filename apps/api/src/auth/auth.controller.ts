import { Body, Controller, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { signInSchema } from '@assessment/contracts';
import { SupabaseAuthService } from './supabase-auth.service';

const accessCookie = 'assessment_access';
const refreshCookie = 'assessment_refresh';
const cookieBase = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: SupabaseAuthService) {}
  @Post('sign-in') @HttpCode(204)
  async signIn(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = signInSchema.parse(body);
    this.setSession(res, await this.auth.signIn(input.email, input.password));
  }
  @Post('refresh') @HttpCode(204)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[refreshCookie];
    if (!token) throw new UnauthorizedException('No refresh session');
    this.setSession(res, await this.auth.refresh(token));
  }
  @Post('sign-out') @HttpCode(204)
  signOut(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(accessCookie, cookieBase); res.clearCookie(refreshCookie, cookieBase);
  }
  private setSession(res: Response, session: { access_token: string; refresh_token: string; expires_in: number }) {
    res.cookie(accessCookie, session.access_token, { ...cookieBase, maxAge: session.expires_in * 1000 });
    res.cookie(refreshCookie, session.refresh_token, { ...cookieBase, maxAge: 30 * 24 * 60 * 60 * 1000 });
  }
}
