import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const setTheme = vi.fn()
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme }),
}))

import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  it('alterna para dark quando o tema atual é light', () => {
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button', { name: /alternar tema/i }))
    expect(setTheme).toHaveBeenCalledWith('dark')
  })
})
