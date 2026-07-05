import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** 조건부 클래스 병합 유틸(Tailwind 충돌 해소 포함). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
