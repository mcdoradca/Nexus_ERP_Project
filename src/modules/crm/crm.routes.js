const express = require('express');
const router = express.Router();
const crmController = require('./crm.controller');
const { authenticateToken, requireSuperUser } = require('../../middlewares/auth.middleware');

router.use(authenticateToken); // Wszystkie routy CRM są chronione

// Auto-fill (GUS API)
router.get('/autofill/:nip', crmController.autofillByNip);

// Companies
router.get('/companies', crmController.getCompanies);
router.post('/companies', crmController.createCompany);
router.patch('/companies/:id', crmController.updateCompany);
router.delete('/companies/:id', requireSuperUser, crmController.deleteCompany);
router.post('/companies/:id/delete', requireSuperUser, crmController.deleteCompany); // Fallback proxy

// Branches
router.post('/companies/:companyId/branches', crmController.createBranch);
router.patch('/branches/:branchId', crmController.updateBranch);
router.delete('/branches/:branchId', requireSuperUser, crmController.deleteBranch);
router.post('/branches/:branchId/delete', requireSuperUser, crmController.deleteBranch); // Fallback proxy

// Contacts
router.post('/companies/:companyId/contacts', crmController.createContact);
router.patch('/contacts/:contactId', crmController.updateContact);
router.delete('/contacts/:contactId', requireSuperUser, crmController.deleteContact);
router.post('/contacts/:contactId/delete', requireSuperUser, crmController.deleteContact); // Fallback proxy

module.exports = router;
