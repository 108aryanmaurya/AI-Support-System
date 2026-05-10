import { useCallback, useEffect, useRef } from 'react'

/**
 * Returns a stable debounced function; latest `fn` is always invoked.
 * Cleans up pending timeouts on unmount.
 *
 * @template {(...args: unknown[]) => void} F
 * @param {F} fn
 * @param {number} delayMs
 */
export function useDebouncedCallback(fn, delayMs) {
  const fnRef = useRef(fn)
  const timeoutRef = useRef(null)

  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    },
    [],
  )

  return useCallback(
    (...args) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null
        fnRef.current(...args)
      }, delayMs)
    },
    [delayMs],
  )
}
