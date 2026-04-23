async function run() {
    try {
        const ean = "8000137016273";
        // Login
        const loginRes = await fetch('http://localhost:3001/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({email:'admin@nexuserp.com', password:'admin'}),
            headers: {'Content-Type': 'application/json'}
        });
        const loginData = await loginRes.json();
        const token = loginData.token;
        if (!token) return console.log("Brak tokenu", loginData);
        
        const fetchRes = await fetch('http://localhost:3001/api/products/autofill/' + ean, {
            headers: {'Authorization': 'Bearer ' + token}
        });
        console.log("STATUS:", fetchRes.status);
        console.log("BODY:", await fetchRes.text());
    } catch(e) {
        console.log("Błąd skryptu:", e);
    }
}
run();
