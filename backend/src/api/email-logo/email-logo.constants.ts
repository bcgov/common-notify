export const EMAIL_LOGO_STORAGE = 'EMAIL_LOGO_STORAGE'
export const EMAIL_LOGO_STORAGE_PREFIX = 'logos/'

export const SYSTEM_EMAIL_LOGO_KEYS = [
  'logos/BC_AF_H_RGB_pos.svg',
  'logos/BC_AG_H_RGB_pos.svg',
  'logos/BC_CFD_H_RGB_pos.svg',
  'logos/BC_CITZ_H_RGB_pos.svg',
  'logos/BC_ECC_H_RGB_pos.svg',
  'logos/BC_ECS_H_RGB_pos.svg',
  'logos/BC_EMCR_H_RGB_pos.svg',
  'logos/BC_ENV_H_RGB_pos.svg',
  'logos/BC_FIN_H_RGB_pos.svg',
  'logos/BC_FOR_H_RGB_pos.svg',
  'logos/BC_HLTH_H_RGB_pos.svg',
  'logos/BC_HMA_H_RGB_pos.svg',
  'logos/BC_INF_H_RGB_pos.svg',
  'logos/BC_IRR_H_RGB_pos.svg',
  'logos/BC_JEG_H_RGB_pos.svg',
  'logos/BC_LBR_H_RGB_pos.svg',
  'logos/BC_MCM_H_RGB_pos.svg',
  'logos/BC_PSFS_H_RGB_pos.svg',
  'logos/BC_PSSG_H_RGB_pos.svg',
  'logos/BC_SDPR_H_RGB_pos.svg',
  'logos/BC_TACS_H_RGB_pos.svg',
  'logos/BC_TT_H_RGB_pos.svg',
  'logos/BC_WLRS_H_RGB_pos.svg',
] as const

// Emails show the logo at EMAIL_LOGO_DISPLAY_WIDTH and the PNG is rendered at twice that,
// so it stays sharp on high-density screens.
export const EMAIL_LOGO_DISPLAY_WIDTH = 200
export const EMAIL_LOGO_PNG_WIDTH = EMAIL_LOGO_DISPLAY_WIDTH * 2
