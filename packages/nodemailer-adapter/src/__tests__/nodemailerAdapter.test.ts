import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('nodemailer', () => {
  const mockSendMail = vi.fn()
  return {
    default: {
      createTransport: vi.fn().mockReturnValue({
        sendMail: mockSendMail,
      }),
    },
    __mockSendMail: mockSendMail,
  }
})

import nodemailer from 'nodemailer'
import { nodemailerAdapter } from '../index.js'

const mockSendMail = (await import('nodemailer') as unknown as { __mockSendMail: ReturnType<typeof vi.fn> }).__mockSendMail

describe('nodemailerAdapter', () => {
  const config = {
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    auth: { user: 'testuser', pass: 'testpass' },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create a transport with the provided config', () => {
    nodemailerAdapter(config)
    expect(nodemailer.createTransport).toHaveBeenCalledWith(config)
  })

  it('should send an email with correct parameters', async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: '<msg-1@example.com>' })

    const adapter = nodemailerAdapter(config)
    await adapter.send({
      from: 'noreply@example.com',
      to: 'user@example.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
    })

    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'noreply@example.com',
      to: 'user@example.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
    })
  })

  it('should propagate transport errors', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('Connection refused'))

    const adapter = nodemailerAdapter(config)
    await expect(
      adapter.send({
        from: 'noreply@example.com',
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        text: 'Test',
      }),
    ).rejects.toThrow('Connection refused')
  })

  it('should work without auth config', () => {
    const noAuthConfig = { host: 'localhost', port: 25 }
    nodemailerAdapter(noAuthConfig)
    expect(nodemailer.createTransport).toHaveBeenCalledWith(noAuthConfig)
  })
})
