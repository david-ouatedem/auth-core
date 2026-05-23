import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  HttpException,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import type { AuthCore } from '@authcore/core'
import { AuthError, generateCsrfToken } from '@authcore/core'
import { AuthGuard } from './auth.guard.js'
import { CurrentUser } from './decorators.js'
import {
  AUTH_CORE,
  AUTH_MODULE_OPTIONS,
  AUTH_COOKIE_NAME,
  AUTH_USE_COOKIES,
  AUTH_CSRF_ENABLED,
} from './constants.js'
import type { PublicUser } from '@authcore/types'

interface ModuleOptions {
  baseUrl?: string
  /**
   * Where to redirect the user after a successful OAuth callback in cookie mode.
   * Default: '/'. Ignored when `useCookies` is false (the response is JSON).
   */
  oauthSuccessRedirect?: string
  /**
   * Where to redirect the user after a successful magic-link consume in
   * cookie mode. Default: '/'. In api mode + this set, the server redirects
   * to that URL with `#token=…&refreshToken=…`.
   */
  magicLinkSuccessRedirect?: string
}

function toHttpException(err: unknown): HttpException {
  if (err instanceof AuthError) {
    return new HttpException(
      { error: err.message, code: err.code },
      err.statusCode,
    )
  }
  return new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
}

@Controller('auth')
export class AuthController {
  private readonly refreshCookieName: string
  private readonly csrfCookieName: string

  constructor(
    @Inject(AUTH_CORE) private readonly auth: AuthCore,
    @Inject(AUTH_MODULE_OPTIONS) private readonly options: ModuleOptions,
    @Inject(AUTH_COOKIE_NAME) private readonly cookieName: string,
    @Inject(AUTH_USE_COOKIES) private readonly useCookies: boolean,
    @Inject(AUTH_CSRF_ENABLED) private readonly csrfEnabled: boolean,
  ) {
    this.refreshCookieName = `${cookieName}_refresh`
    this.csrfCookieName = `${cookieName}_csrf`
  }

  private setAuthCookies(res: Response, token: string, refreshToken: string): void {
    const secure = process.env['NODE_ENV'] === 'production'
    res.cookie(this.cookieName, token, { httpOnly: true, sameSite: 'lax', secure, path: '/' })
    res.cookie(this.refreshCookieName, refreshToken, { httpOnly: true, sameSite: 'lax', secure, path: '/' })
    if (this.csrfEnabled) {
      res.cookie(this.csrfCookieName, generateCsrfToken(), {
        httpOnly: false,
        sameSite: 'lax',
        secure,
        path: '/',
      })
    }
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie(this.cookieName, { path: '/' })
    res.clearCookie(this.refreshCookieName, { path: '/' })
    if (this.csrfEnabled) res.clearCookie(this.csrfCookieName, { path: '/' })
  }

  private readRefreshToken(req: Request, body: { refreshToken?: string } | undefined): string | null {
    if (body?.refreshToken) return body.refreshToken
    return (req.cookies as Record<string, string> | undefined)?.[this.refreshCookieName] ?? null
  }

  @Post('register')
  async register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    try {
      const { user, token, refreshToken } = await this.auth.register(body)
      if (this.useCookies) {
        this.setAuthCookies(res, token, refreshToken)
        return { user }
      }
      return { user, token, refreshToken }
    } catch (err) {
      throw toHttpException(err)
    }
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    try {
      const { user, token, refreshToken } = await this.auth.login(body)
      if (this.useCookies) {
        this.setAuthCookies(res, token, refreshToken)
        return { user }
      }
      return { user, token, refreshToken }
    } catch (err) {
      throw toHttpException(err)
    }
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Body() body: { refreshToken?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const rawRefresh = this.readRefreshToken(req, body)
      if (!rawRefresh) {
        throw new HttpException({ error: 'Refresh token is required', code: 'INVALID_TOKEN' }, 401)
      }
      const { user, token, refreshToken } = await this.auth.refresh(rawRefresh)
      if (this.useCookies) {
        this.setAuthCookies(res, token, refreshToken)
        return { user }
      }
      return { user, token, refreshToken }
    } catch (err) {
      if (err instanceof HttpException) throw err
      throw toHttpException(err)
    }
  }

  @Post('revoke')
  @HttpCode(200)
  async revoke(
    @Req() req: Request,
    @Body() body: { refreshToken?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const rawRefresh = this.readRefreshToken(req, body)
      if (rawRefresh) await this.auth.revoke(rawRefresh)
      if (this.useCookies) this.clearAuthCookies(res)
      return { message: 'Revoked' }
    } catch (err) {
      throw toHttpException(err)
    }
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Body() body: { refreshToken?: string } | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const rawRefresh = this.readRefreshToken(req, body)
      if (rawRefresh) await this.auth.revoke(rawRefresh)
    } catch {
      // Best-effort
    }
    if (this.useCookies) this.clearAuthCookies(res)
    return { message: 'Logged out successfully' }
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: PublicUser) {
    return user
  }

  @Post('verify-email')
  async verifyEmail(@Body() body: unknown) {
    try {
      await this.auth.verifyEmail(body)
      return { message: 'Email verified successfully' }
    } catch (err) {
      throw toHttpException(err)
    }
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: unknown) {
    try {
      const baseUrl = this.options.baseUrl ?? ''
      await this.auth.forgotPassword(body, { resetUrl: `${baseUrl}/auth/reset-password` })
    } catch {
      // Intentionally swallow errors to prevent email enumeration
    }
    return { message: 'If that email exists, a reset link has been sent.' }
  }

  @Post('reset-password')
  async resetPassword(@Body() body: unknown) {
    try {
      await this.auth.resetPassword(body)
      return { message: 'Password updated successfully' }
    } catch (err) {
      throw toHttpException(err)
    }
  }

  @Post('invite')
  @UseGuards(AuthGuard)
  async invite(@Body() body: unknown) {
    try {
      const baseUrl = this.options.baseUrl ?? ''
      await this.auth.invite(body, { inviteUrl: `${baseUrl}/auth/accept-invitation` })
      return { message: 'Invitation sent' }
    } catch (err) {
      throw toHttpException(err)
    }
  }

  @Post('accept-invitation')
  async acceptInvitation(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    try {
      const { user, token, refreshToken } = await this.auth.acceptInvitation(body)
      if (this.useCookies) {
        this.setAuthCookies(res, token, refreshToken)
        return { user }
      }
      return { user, token, refreshToken }
    } catch (err) {
      throw toHttpException(err)
    }
  }

  @Post('magic-link')
  async sendMagicLink(@Body() body: unknown) {
    try {
      const baseUrl = this.options.baseUrl ?? ''
      const magicLinkUrl = `${baseUrl}/auth/magic-link/consume`
      await this.auth.sendMagicLink(body, { magicLinkUrl })
    } catch (err) {
      if (err instanceof AuthError && err.code !== 'INVALID_TOKEN') {
        throw toHttpException(err)
      }
      // Swallow other errors — enumeration-safe.
    }
    return { message: 'If that email exists, a sign-in link has been sent.' }
  }

  @Get('magic-link/consume')
  async consumeMagicLink(@Query('token') token: string, @Res() res: Response): Promise<void> {
    try {
      const { user, token: jwt, refreshToken } = await this.auth.consumeMagicLink({ token: token ?? '' })
      if (this.useCookies) {
        this.setAuthCookies(res, jwt, refreshToken)
        res.redirect(this.options.magicLinkSuccessRedirect ?? '/')
      } else if (this.options.magicLinkSuccessRedirect) {
        const params = new URLSearchParams({ token: jwt, refreshToken })
        res.redirect(`${this.options.magicLinkSuccessRedirect}#${params.toString()}`)
      } else {
        res.json({ user, token: jwt, refreshToken })
      }
    } catch (err) {
      throw toHttpException(err)
    }
  }

  @Get('oauth/:provider')
  async oauthStart(@Param('provider') provider: string, @Res() res: Response): Promise<void> {
    try {
      const baseUrl = this.options.baseUrl ?? ''
      const redirectUri = `${baseUrl}/auth/oauth/${provider}/callback`
      const { authorizationUrl } = await this.auth.oauthStart(provider, redirectUri)
      res.redirect(authorizationUrl)
    } catch (err) {
      throw toHttpException(err)
    }
  }

  @Get('oauth/:provider/callback')
  async oauthCallback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const baseUrl = this.options.baseUrl ?? ''
      const redirectUri = `${baseUrl}/auth/oauth/${provider}/callback`
      const { user, token, refreshToken } = await this.auth.oauthCallback(provider, {
        code: code ?? '',
        state: state ?? '',
        redirectUri,
      })
      if (this.useCookies) {
        this.setAuthCookies(res, token, refreshToken)
        res.redirect(this.options.oauthSuccessRedirect ?? '/')
      } else if (this.options.oauthSuccessRedirect) {
        const params = new URLSearchParams({ token, refreshToken })
        res.redirect(`${this.options.oauthSuccessRedirect}#${params.toString()}`)
      } else {
        res.json({ user, token, refreshToken })
      }
    } catch (err) {
      throw toHttpException(err)
    }
  }
}
