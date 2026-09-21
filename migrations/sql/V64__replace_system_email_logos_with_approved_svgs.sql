-- Replace only the placeholder SYSTEM catalog seeded by V56.
-- Selections are intentionally cleared, not mapped to the new ministry logos.
-- New UUIDs and SVG storage keys avoid reusing immutable public image URLs.
BEGIN;

DO $$
DECLARE
  placeholder_ids UUID[];
BEGIN
  SELECT array_agg(id) INTO placeholder_ids
  FROM notify.email_logo
  WHERE source_code = 'SYSTEM'
    AND file_key IN (
      'logos/bc-gov-logo-primary.png',
      'logos/bc-gov-logo-alt.png',
      'logos/avalanche_and_weather_programs.png',
      'logos/avalanche_weather_programs.png',
      'logos/bc_avalanche_and_weather_programs.png',
      'logos/bc_health_gateway.png',
      'logos/bc_ocio.png',
      'logos/bc_parks.png',
      'logos/bc_wlrs.png',
      'logos/buy_bc.png',
      'logos/clean_bc_better_homes.png',
      'logos/ministry_of_citizens_services.png',
      'logos/ministry_of_education_and_child_care.png',
      'logos/ministry_of_finance_imb.png',
      'logos/ministry_of_housing_and_municipal_affairs.png',
      'logos/service_bc.png',
      'logos/service_bc_bcrds.png',
      'logos/service_bc_bcros_logo.png'
    );

  -- Include soft-deleted referencing rows: their foreign keys still apply.
  UPDATE notify.tenant_settings
  SET email_logo_id = NULL
  WHERE email_logo_id = ANY (placeholder_ids);

  -- Preserve use_custom_header, header_title, and all other event settings.
  UPDATE notify.event_channel_setting
  SET header_logo_id = NULL
  WHERE header_logo_id = ANY (placeholder_ids);

  DELETE FROM notify.email_logo
  WHERE id = ANY (placeholder_ids);
END $$;

-- IDs and timestamps use the defaults established by V55 (gen_random_uuid/now).
INSERT INTO notify.email_logo (name, file_key, source_code, status_code, tenant_id, is_deleted)
VALUES
  ('Agriculture and Food (AF)', 'logos/BC_AF_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Attorney General (AG)', 'logos/BC_AG_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Children and Family Development (CFD)', 'logos/BC_CFD_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Citizens’ Services (CITZ)', 'logos/BC_CITZ_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Education and Child Care (ECC)', 'logos/BC_ECC_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Energy and Climate Solutions (ECS)', 'logos/BC_ECS_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Emergency Management and Climate Readiness (EMCR)', 'logos/BC_EMCR_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Environment and Parks (ENV)', 'logos/BC_ENV_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Finance (FIN)', 'logos/BC_FIN_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Forests (FOR)', 'logos/BC_FOR_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Health (HLTH)', 'logos/BC_HLTH_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Housing and Municipal Affairs (HMA)', 'logos/BC_HMA_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Infrastructure (INF)', 'logos/BC_INF_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Indigenous Relations and Reconciliation (IRR)', 'logos/BC_IRR_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Jobs and Economic Growth (JEG)', 'logos/BC_JEG_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Labour (LBR)', 'logos/BC_LBR_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Mining and Critical Minerals (MCM)', 'logos/BC_MCM_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Post-Secondary Education and Future Skills (PSFS)', 'logos/BC_PSFS_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Public Safety and Solicitor General (PSSG)', 'logos/BC_PSSG_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Social Development and Poverty Reduction (SDPR)', 'logos/BC_SDPR_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Tourism, Arts, Culture and Sport (TACS)', 'logos/BC_TACS_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Transportation and Transit (TT)', 'logos/BC_TT_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE),
  ('Water, Land and Resource Stewardship (WLRS)', 'logos/BC_WLRS_H_RGB_pos.svg', 'SYSTEM', 'APPROVED', NULL, FALSE);

COMMIT;
