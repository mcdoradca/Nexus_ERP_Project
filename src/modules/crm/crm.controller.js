const crmService = require('./crm.service');

const crmController = {
  // Autofill
  async autofillByNip(req, res) {
    try {
      const { nip } = req.params;
      const data = await crmService.fetchCompanyFromGus(nip);
      if (!data) return res.status(404).json({ error: 'Nie znaleziono podmiotu dla podanego NIP.' });
      res.status(200).json(data);
    } catch (err) {
      res.status(500).json({ error: 'Wystąpił błąd podczas pingu do serwerów Rządowych.' });
    }
  },

  // Companies
  async getCompanies(req, res) {
    try {
      const companies = await crmService.getAllCompanies();
      res.status(200).json(companies);
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  async createCompany(req, res) {
    try {
      const company = await crmService.createCompany(req.body);
      res.status(201).json(company);
    } catch (err) {
       if(err.code === 'P2002') return res.status(400).json({ error: 'Firma z tym NIP już istnieje w CRM.' });
       res.status(500).json({ error: err.message }); 
    }
  },

  async updateCompany(req, res) {
    try {
      const company = await crmService.updateCompany(req.params.id, req.body);
      res.status(200).json(company);
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  async deleteCompany(req, res) {
    try {
      await crmService.deleteCompany(req.params.id);
      res.status(200).json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  // Branches
  async createBranch(req, res) {
    try {
      const branch = await crmService.createBranch(req.params.companyId, req.body);
      res.status(201).json(branch);
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  async updateBranch(req, res) {
    try {
      const branch = await crmService.updateBranch(req.params.branchId, req.body);
      res.status(200).json(branch);
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  async deleteBranch(req, res) {
    try {
      await crmService.deleteBranch(req.params.branchId);
      res.status(200).json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  // Contacts
  async createContact(req, res) {
    try {
      const contact = await crmService.createContact(req.params.companyId, req.body);
      res.status(201).json(contact);
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  async updateContact(req, res) {
    try {
      const contact = await crmService.updateContact(req.params.contactId, req.body);
      res.status(200).json(contact);
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  async deleteContact(req, res) {
    try {
      await crmService.deleteContact(req.params.contactId);
      res.status(200).json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
};

module.exports = crmController;
