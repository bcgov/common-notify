# Test File for CCP-4541

This file is created to test that changes to markdown files in the docs folder do not trigger builds/deployments.

**Expected Behavior:**
- Workflow should be skipped when only this file is modified
- No builds should run
- No deployments should occur

**Ticket:** CCP-4541 - Skip builds when only MD/docs files change

**Test Date:** 2026-05-20
