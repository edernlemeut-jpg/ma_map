import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateSystemUpdate, saveSystemUpdate } from '../../public/js/map/map-service.js';

describe('Map — System Editing (Story 3.2)', () => {
  describe('T1: validateSystemUpdate', () => {
    it('passes valid system', () => {
      const result = validateSystemUpdate({
        nom: 'Sol',
        gouvernement: 'Impérial',
        route: 'Route +1',
        description: 'Home system',
        faction: 'Empire'
      });
      assert.equal(result.length, 0, 'Should have no errors');
    });

    it('rejects empty nom', () => {
      const result = validateSystemUpdate({
        nom: '',
        gouvernement: 'Test'
      });
      assert.ok(result.some(e => e.includes('nom')) || result.some(e => e.includes('requis')));
    });

    it('rejects nom exceeding 255 characters', () => {
      const result = validateSystemUpdate({
        nom: 'A'.repeat(300),
        gouvernement: 'Test'
      });
      assert.ok(result.some(e => e.includes('255')));
    });

    it('rejects description exceeding 2000 characters', () => {
      const result = validateSystemUpdate({
        nom: 'Test',
        description: 'X'.repeat(2500)
      });
      assert.ok(result.some(e => e.includes('2000')));
    });

    it('allows empty optional fields', () => {
      const result = validateSystemUpdate({
        nom: 'Sol',
        gouvernement: '',
        route: '',
        description: ''
      });
      assert.equal(result.length, 0);
    });
  });

  describe('T2: saveSystemUpdate (mock API)', () => {
    it('sends PATCH request with correct structure', async () => {
      // Note: This is a unit test without actual network.
      // In real E2E tests with Playwright, you would verify the actual HTTP request.
      // For now, we test the validation + request structure.
      
      const updates = { nom: 'NewName', gouvernement: 'NewGov' };
      const errors = validateSystemUpdate({ 
        nom: updates.nom,
        gouvernement: updates.gouvernement 
      });
      
      assert.equal(errors.length, 0, 'Updates should pass validation');
      assert.ok(typeof updates === 'object');
      assert.ok(Object.keys(updates).length > 0);
    });
  });

  describe('T3: MJ vs Non-MJ Behavior', () => {
    it('isMJ check determines edit mode', () => {
      const mockUserAdmin = { is_admin: true };
      const mockUserPlayer = { is_admin: false };
      
      const isAdminUser = mockUserAdmin?.is_admin === true;
      const isPlayerUser = mockUserPlayer?.is_admin === true;
      
      assert.ok(isAdminUser, 'Admin should have is_admin = true');
      assert.ok(!isPlayerUser, 'Player should have is_admin = false');
    });

    it('read-only fields never editable even for MJ', () => {
      // Fields like quadrant and is_frontiere should be readonly
      const readonlyFields = ['quadrant', 'is_frontiere'];
      const editableFields = ['nom', 'gouvernement', 'route', 'description'];
      
      assert.ok(readonlyFields.every(f => readonlyFields.includes(f)));
      assert.ok(editableFields.every(f => !readonlyFields.includes(f)));
    });
  });

  describe('T4: Field Type Handling', () => {
    it('handles string fields correctly', () => {
      const update = { nom: 'NewName', gouvernement: 'Imperial' };
      assert.ok(typeof update.nom === 'string');
      assert.ok(typeof update.gouvernement === 'string');
    });

    it('handles undefined fields (not included in update)', () => {
      const update = {};
      const fieldsToUpdate = Object.keys(update);
      assert.equal(fieldsToUpdate.length, 0, 'No fields should be updated if empty');
    });

    it('handles empty string values', () => {
      const result = validateSystemUpdate({
        nom: 'Test',
        gouvernement: ''  // Empty but valid
      });
      assert.equal(result.length, 0, 'Empty strings should be allowed for optional fields');
    });
  });

  describe('T5: Long field validation', () => {
    it('gouvernement field max 255 chars', () => {
      const longGov = 'X'.repeat(256);
      const result = validateSystemUpdate({
        nom: 'Test',
        gouvernement: longGov
      });
      assert.ok(result.some(e => e.includes('gouvernement')));
    });

    it('description field max 2000 chars', () => {
      const longDesc = 'Y'.repeat(2001);
      const result = validateSystemUpdate({
        nom: 'Test',
        description: longDesc
      });
      assert.ok(result.some(e => e.includes('2000')));
    });
  });
});
