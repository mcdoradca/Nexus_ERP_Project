const express = require('express');
const router = express.Router();
const crmController = require('./crm.controller');
const { authenticateToken } = require('../../middlewares/auth.middleware');

router.use(authenticateToken); // Wszystkie routy CRM są chronione

// Auto-fill (GUS API)
router.get('/autofill/:nip', crmController.autofillByNip);

// Companies
router.get('/companies', crmController.getCompanies);
router.post('/companies', crmController.createCompany);
router.patch('/companies/:id', crmController.updateCompany);
router.delete('/companies/:id', crmController.deleteCompany);

// Branches
router.post('/companies/:companyId/branches', crmController.createBranch);
router.patch('/branches/:branchId', crmController.updateBranch);
router.delete('/branches/:branchId', crmController.deleteBranch);

// Contacts
router.post('/companies/:companyId/contacts', crmController.createContact);
router.patch('/contacts/:contactId', crmController.updateContact);
router.delete('/contacts/:contactId', crmController.deleteContact);

module.exports = router;
