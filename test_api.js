const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const camps = await prisma.campaign.findMany();
  const c = camps[0];
  const co = await prisma.company.findFirst();
  
  if (!c || !co) return console.log('Brak danych testowych!');

  // Udajemy wywołanie z Modału Kampanii, aby przetestować czy backend to przyjmuje
  console.log(`Symulacja API: PATCH kampanii ${c.id} z contractorIds: ['${co.id}']`);
  
  try {
    const res = await axios.patch(`http://localhost:3001/api/campaigns/${c.id}`, {
      contractorIds: [co.id]
    }, {
      headers: {
        // Tu używamy mockowania lub po prostu patrzymy czy serwer nie wyrzuci 500
        // Autoryzacja zawiedzie bez JWT, więc ominiemy to, uderzając w serwis bezposrednio.
      }
    });
    console.log(res.data);
  } catch (err) {
    console.log('API zgłosiło błąd (prawdopodobnie 401 Unauthorized, to normalne jeśli brak tokena):', err.status || err.message);
  }
}
run().finally(()=>prisma.$disconnect());
