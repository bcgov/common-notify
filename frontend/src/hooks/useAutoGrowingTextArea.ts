import { useLayoutEffect, useRef } from 'react'

type AutoGrowingTextAreaOptions = {
  measurementText?: string
}

const measureTextHeight = (textarea: HTMLTextAreaElement, measurementText: string) => {
  const measurementTextarea = textarea.cloneNode() as HTMLTextAreaElement
  measurementTextarea.removeAttribute('id')
  measurementTextarea.removeAttribute('name')
  measurementTextarea.setAttribute('aria-hidden', 'true')
  measurementTextarea.tabIndex = -1
  measurementTextarea.value = measurementText
  measurementTextarea.placeholder = ''
  measurementTextarea.style.position = 'absolute'
  measurementTextarea.style.visibility = 'hidden'
  measurementTextarea.style.pointerEvents = 'none'
  measurementTextarea.style.height = 'auto'
  measurementTextarea.style.width = `${textarea.getBoundingClientRect().width}px`

  textarea.parentElement?.appendChild(measurementTextarea)
  const measuredHeight = measurementTextarea.scrollHeight
  measurementTextarea.remove()

  return measuredHeight
}

const useAutoGrowingTextArea = (
  value: string,
  { measurementText }: AutoGrowingTextAreaOptions = {},
) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    const contentHeight =
      !value && measurementText
        ? measureTextHeight(textarea, measurementText)
        : textarea.scrollHeight
    textarea.style.height = `${contentHeight}px`
  }, [measurementText, value])

  return textareaRef
}

export default useAutoGrowingTextArea
