import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  UseGuards,
  HttpException,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common'
import type { Response } from 'express'
import type { AuthCore } from '@authcore/core'
import { AuthError } from '@authcore/core'
import { AuthGuard } from './auth.guard.js'
import { CurrentUser } from './decorators.js'
import { AUTH_CORE, AUTH_MODULE_OPTIONS } from './constants.js'
import type { PublicUser } from '@authcore/types'

interface ModuleOptions {
  baseUrl?: string
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
  constructor(
    @Inject(AUTH_CORE) private readonly auth: AuthCore,
    @Inject(AUTH_MODULE_OPTIONS) private readonly options: ModuleOptions,
  ) {}

  @Post('register')
  async register(@Body() body: unknown) {
    try {
      const { user, token } = await this.auth.register(body)
      return { user, token }
    } catch (err) {
      throw toHttpException(err)
    }
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown) {
    try {
      const { user, token } = await this.auth.login(body)
      return { user, token }
    } catch (err) {
      throw toHttpException(err)
    }
  }

  @Post('logout')
  @HttpCode(200)
  logout() {
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
      await this.auth.forgotPassword(body)
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
  async acceptInvitation(@Body() body: unknown) {
    try {
      const { user, token } = await this.auth.acceptInvitation(body)
      return { user, token }
    } catch (err) {
      throw toHttpException(err)
    }
  }
}
