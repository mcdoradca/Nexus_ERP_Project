/**
 * Centralny Globalny Handler Błędów
 * Przechwytuje wyjątki z procesu, asynchronicznych endpointów i logiki biznesowej, formatując je w ustrukturyzowany, ujednolicony JSON.
 */
function errorHandler(err, req, res, next) {
    console.error("🔥 [CRITICAL EXCEPTION CAUGHT]:", err.message);
    
    // Stack trace tylko dla celów deweloperskich/logowania w pamięci chmurowej
    if (process.env.NODE_ENV !== 'production') {
        console.error(err.stack);
    }

    const statusCode = err.status || 500;
    const responsePayload = {
        error: true,
        message: err.message || "Błąd wewnętrzny serwera",
    };

    // Przekazanie dodatkowych detali jeśli istnieją (np. błędy z AI)
    if (err.details) {
        responsePayload.details = err.details;
    }

    if (process.env.NODE_ENV !== 'production' && err.stack) {
        responsePayload.stack = err.stack;
    }

    res.status(statusCode).json(responsePayload);
}

module.exports = errorHandler;
