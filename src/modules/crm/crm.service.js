const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const crmService = {
  // Companies
  async getAllCompanies() {
    return prisma.company.findMany({
      include: { branches: true, contacts: true },
      orderBy: { name: 'asc' }
    });
  },

  async getCompanyById(id) {
    return prisma.company.findUnique({
      where: { id },
      include: { branches: true, contacts: true }
    });
  },

  async createCompany(data) {
    return prisma.company.create({
      data,
      include: { branches: true, contacts: true }
    });
  },

  async updateCompany(id, data) {
    return prisma.company.update({
      where: { id },
      data,
      include: { branches: true, contacts: true }
    });
  },

  async deleteCompany(id) {
    return prisma.company.delete({ where: { id } });
  },

  // Branches
  async createBranch(companyId, data) {
    return prisma.companyBranch.create({
      data: { ...data, companyId }
    });
  },

  async updateBranch(id, data) {
    return prisma.companyBranch.update({ where: { id }, data });
  },

  async deleteBranch(id) {
    return prisma.companyBranch.delete({ where: { id } });
  },

  // Contacts
  async createContact(companyId, data) {
    return prisma.contactPerson.create({
      data: { ...data, companyId }
    });
  },

  async updateContact(id, data) {
    return prisma.contactPerson.update({ where: { id }, data });
  },

  async deleteContact(id) {
    return prisma.contactPerson.delete({ where: { id } });
  },

  // AutoFill via GUS / VIES (Biała Lista)
  async fetchCompanyFromGus(nip) {
    const cleanNip = nip.replace(/[\s-]/g, '');
    const today = new Date().toISOString().split('T')[0];
    try {
      const res = await fetch(`https://wl-api.mf.gov.pl/api/search/nip/${cleanNip}?date=${today}`);
      if (!res.ok) return null;
      const data = await res.json();
      
      if (data && data.result && data.result.subject) {
        const subject = data.result.subject;
        return {
          taxId: subject.nip,
          regon: subject.regon,
          krs: subject.krs || '',
          name: subject.name,
          address: subject.workingAddress || subject.residenceAddress || ''
        };
      }
      return null;
    } catch (error) {
      console.error('Błąd pobierania danych z Białej Listy:', error.message);
      return null;
    }
  }
};

module.exports = crmService;
