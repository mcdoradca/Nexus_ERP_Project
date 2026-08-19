# Zgłoszenie: Błędna Geolokalizacja IP dla Gemini API / Google AI Studio

**Tytuł zgłoszenia (Temat):** 
Incorrect Geolocation / Geoblocking for IPv6 subnet (API Error 400: User location is not supported)

**Adres do formularza zgłoszeń Google:** 
Obecnie Google obsługuje tego typu sprawy poprzez centralne narzędzie do zgłaszania problemów z routingiem i lokalizacją:
* **Formularz IP issue / Location:** https://support.google.com/websearch/workflow/9308722?hl=en 
* **Alternatywnie (Issue Tracker dla Google AI Studio / Gemini API):** https://issuetracker.google.com/issues/new?component=1389249

---

**Treść zgłoszenia (j. angielski):**

Hello Google Support / AI Studio Team,

We are experiencing a persistent "FAILED_PRECONDITION" (400 Bad Request: "User location is not supported for the API use.") error when calling the Gemini API from our production server.

After extensive network diagnostics, we have pinpointed the issue exclusively to the IPv6 routing stack. 
When forcing the requests over IPv4, the API returns HTTP 200 (Success) consistently. However, any requests originating from our IPv6 address are automatically blocked due to region restrictions.

Our server is hosted in an OVH Datacenter located in the EU (European Union), which is a fully supported region for the Gemini API. It appears that your GeoIP database has miscategorized our IPv6 subnet, falsely flagging it as a restricted or unsupported territory.

**Technical Details:**
- Assigned IPv4 (Working): 145.239.73.39
- Assigned IPv6 (Blocked): 2001:41d0:305:2100::1:36c2 (and the entire /64 subnet allocated to us)
- API Endpoint: https://generativelanguage.googleapis.com/v1beta/models
- HTTP Client: Node.js 20 / cURL

Steps to Reproduce on our machine:
`curl -4 ...` -> 200 OK
`curl -6 ...` -> 400 Bad Request (User location is not supported)

Please review and update the GeoIP categorization for the IPv6 subnet `2001:41d0:305:2100::/64` to reflect its true physical location (EU) so we can restore dual-stack connectivity.

Thank you.
