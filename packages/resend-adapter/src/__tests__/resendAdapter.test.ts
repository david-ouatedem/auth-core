import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('resend', () => {
  const mockSend = vi.fn()
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: { send: mockSend },
    })),
    __mockSend: mockSend,
  }
})

import { Resend } from 'resend'
import { resendAdapter } from '../index.js'

// Access the mock send function
const mockSend = (await import('resend') as unknown as { __mockSend: ReturnType<typeof vi.fn> }).__mockSend

describe('resendAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create a Resend client with the provided API key', () => {
    resendAdapter('re_test_123')
    expect(Resend).toHaveBeenCalledWith('re_test_123')
  })

  it('should send an email with correct parameters', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'msg_1' }, error: null })

    const adapter = resendAdapter('re_test_123')
    await adapter.send({
      from: 'noreply@example.com',
      to: 'user@example.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
    })

    expect(mockSend).toHaveBeenCalledWith({
      from: 'noreply@example.com',
      to: 'user@example.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
    })
  })

  it('should throw when Resend returns an error', async () => {
    mockSend.mockResolvedValueOnce({
      data: null,
      error: { message: 'Invalid API key', name: 'validation_error' },
    })

    const adapter = resendAdapter('re_bad_key')
    await expect(
      adapter.send({
        from: 'noreply@example.com',
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        text: 'Test',
      }),
    ).rejects.toThrow('Resend error: Invalid API key')
  })

  it('should propagate network errors', async () => {
    mockSend.mockRejectedValueOnce(new Error('Network timeout'))

    const adapter = resendAdapter('re_test_123')
    await expect(
      adapter.send({
        from: 'noreply@example.com',
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        text: 'Test',
      }),
    ).rejects.toThrow('Network timeout')
  })
})
