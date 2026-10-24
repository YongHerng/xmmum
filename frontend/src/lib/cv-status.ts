import type { CV } from './types';

// These are the persisted CV fields also used by the API to recognise an existing CV.
export function hasCV(cv: Partial<CV>): boolean {
  return Boolean(cv.summary?.trim() || cv.projects?.trim() || cv.experience?.trim() || cv.skills?.length || cv.membership_licensure?.trim() || cv.certificates_training?.trim() || cv.additional_sections?.some(section=>section.content.trim()));
}
