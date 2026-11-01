# Just Share Please: Go-palvelin ja pluginin fork – suunnitelma

Päivitetty: 2026-11-01

## Tarkoitus ja miksi

Just Share Please (JSP) jakaa yksittäisiä Obsidian-muistiinpanoja anonyymillä linkillä (`https://palvelin/#id`). Palvelin on nykyään yksi PHP-tiedosto (`server/public/share.php`) PHP 8.3 + Apache -kontissa.

Käyttäjä pyörittää palvelinta itselleen homelabissa (`/home/mhavo/Dev/hybrid-homelab`, Ansible-rooli `roles/jsp`, Docker-kontti Caddyn takana, Caddy hoitaa HTTPS:n). Palvelu on **tällä hetkellä pois päältä** (`jsp_enabled: false`) PHP/Apache-pinon kriittisten CVE:iden (CVE-2026-109618/109619) takia.

Miksi uudistus:

1. **PHP- ja Apache-riippuvuus on itsessään tietoturvariski.** Tilalle tulee yksi staattinen Go-binääri minimaalisessa kontissa.
2. **Kuka tahansa voi nyt tallentaa palvelimelle sisältöä.** Kirjoittamisen pitää vaatia token.
3. **Pohja tuleville ominaisuuksille:** aikaan sidotut jaot, salasanasuojattu lukeminen ja salattu sisältö.

Palvelimen pitää toimia myös muille itse hostaajille, ei vain tässä homelabissa.

## Tavoitteet (v1)

- Go-palvelin korvaa `share.php`:n ja Apachen. HTTP-rajapinta on yhteensopiva nykyisen pluginin kanssa (sama polku, metodit, kyselyparametrit, otsakkeet ja vastausmuodot).
- Olemassa oleva data (`data/<id>.md` + `data/<id>.json`) toimii sellaisenaan ilman migraatioskriptiä. Vanhat linkit (`#<8 hex>`) aukeavat edelleen.
- Lukusivu (`index.html`, `index.js`, `style.css`, `index.md`, `favicon.ico`) näyttää ja toimii kuten ennen, ja sen tunnetut tietoturva-aukot korjataan.
- Kirjoittavat operaatiot (POST, PATCH, DELETE) vaativat palvelinkohtaisen upload-tokenin.
- Tietoturvakorjaukset (ks. kohta *Tietoturva*).
- Pluginin fork: token-asetus, jota käytetään kaikissa kirjoittavissa kutsuissa.
- Docker-image, joka sopii homelabin nykyiseen compose-pohjaan mahdollisimman pienin muutoksin.
- Metatietojen ja rajapinnan rakenne suunnitellaan niin, että vaiheet 2 ja 3 voi lisätä rikkomatta v1:tä.

## Ei tavoitteita

- Käyttäjätilit, monen käyttäjän tuki tai hallintapaneeli.
- Tietokanta. Tiedostopohjainen tallennus säilyy.
- Lukusivun ulkoasun uudistus.
- Yhteensopivuus alkuperäisen (muokkaamattoman) community-pluginin kanssa *oletuksena*. Se sallitaan vain erillisellä asetuksella (ks. `JSP_ALLOW_ANONYMOUS_UPLOADS`).
- Upstream-julkaisu (Ellpeckin repo tai community-pluginlista).

## Anti-tavoitteet (epäonnistuminen, vaikka "toimisi")

- Nykyiset jaetut linkit lakkaavat toimimasta tai vanhat jaot eivät enää päivity tai poistu pluginista.
- Palvelin käynnistyy hiljaa avoimena kirjoittamiselle, koska token unohtui asettaa.
- Fork päivittyy vahingossa takaisin upstream-pluginiksi (sama plugin-id) ja token-asetus katoaa.
- Salaus (vaihe 3) toteutetaan niin, että palvelin näkee selväkielisen sisällön tai salasanan.
- Uusia raskaita riippuvuuksia palvelimelle (web-frameworkit, ORM:t). Go:n standardikirjasto riittää.

## Rajoitteet

- Go 1.27 (asennettu kehityskoneelle), vain standardikirjasto palvelimessa. Lukusivun front-end-kirjastot pysyvät samoina.
- Palvelin on käänteisen proxyn takana (Caddy) eikä hoida TLS:ää itse.
- Pluginin `requestUrl` (Obsidian) ohittaa CORSin, joten CORS-otsakkeita ei tarvita.
- Lukusivun hash-muoto: `getId()` lukee ID:n ensimmäiseen `-`-merkkiin asti, ja loppuosa on ankkuri (`#<id>-<otsikko>`). **ID ei saa sisältää `-`-merkkiä.** Sama rajoite koskee tulevaa avainosaa (ks. vaihe 3).
- **Kieli:** kaikki koodi, tunnisteet, koodikommentit ja commit-viestit kirjoitetaan englanniksi. Käyttöliittymä on kaksikielinen (suomi + englanti) ja kieli on valittavissa. Tämä koskee pluginin asetussivua, ilmoituksia ja näkymää sekä lukusivun tekstejä (virheet, "Loading…", alatunniste, myöhemmin salasanakysely). Plugin oletuskielenä seuraa Obsidianin kieltä (asetuksella ohitettavissa), ja lukusivu seuraa selaimen kieltä (`navigator.language`, valitsin alatunnisteessa, valinta `localStorage`en). Merkkijonot pidetään yhdessä käännöstaulussa kieltä kohden, jotta kielen lisääminen on helppoa. Palvelimen rajapinnan virherungot pysyvät englanniksi (koneen luettavia).
- Repossa on käyttäjän ohje: tiedostojen poistamisesta (esim. `share.php`, `.github/workflows/server.yml`) kysytään käyttäjältä vahvistus ennen poistoa.

## Arkkitehtuuri

```
server/
  cmd/jsp/main.go          # konfiguraatio, käynnistys, graceful shutdown
  internal/store/          # tiedostotallennus: id-validointi, atominen kirjoitus, meta-skeema
  internal/api/            # /share.php-käsittelijät, token- ja salasanatarkistus, rajoitukset
  public/                  # lukusivu, upotetaan binääriin (embed.FS)
  Dockerfile               # multi-stage: golang -> distroless/static (tai scratch)
  docker-compose.yml
```

Rakenne on ehdotus. Rakentaja saa muokata pakettijakoa, kunhan palvelin pysyy pienenä ja testattavana.

### HTTP-rajapinta (yhteensopiva)

Kaikki kutsut menevät polkuun `/share.php`. Tiedostopääte säilyy, koska plugin ja lukusivu kutsuvat sitä.

| Kutsu | Toiminta | Vastaus |
|---|---|---|
| `GET /share.php?id=<id>` | Palauttaa markdownin | 200 `text/plain; charset=utf-8`, tai 404 `Not found` |
| `GET /share.php?meta&id=<id>` | Julkiset metatiedot | 200 JSON `{"id","created"}` (v2+: myös `expires`, `encrypted`), 404 tai 400 JSON `{"error"}` |
| `GET /share.php?quote` | Satunnainen lainaus `quotes.csv`:stä | 200 JSON `{"quote","source"}` (null, jos ei tiedostoa) |
| `POST /share.php` body `{"content": "..."}` | Luo jaon | 200 JSON `{"id","password","created"}` (selväkielinen salasana palautetaan vain tässä) |
| `PATCH /share.php?id=<id>` otsake `Password`, body `{"content"}` | Päivittää sisällön | 200, 401 `Unauthorized`, 400, 404 |
| `DELETE /share.php?id=<id>` otsake `Password` | Poistaa jaon | 200, 401, 400, 404 |
| `GET /`, staattiset tiedostot | Lukusivu | `index.html` ym. |
| `GET /healthz` | Uusi: terveystarkistus | 200 `ok` |

Muut metodit palauttavat 405. Virheviestien tekstit pidetään samoina kuin PHP:ssä yhteensopivuuden vuoksi. Huom: nykyinen plugin ei näytä vastauksen runkoa, koska `requestUrl` heittää 4xx:llä geneerisen "Request failed, status N" -virheen. Forkin pitää siksi lukea vastaus itse (`throw: false`), jotta se voi erottaa väärän tokenin väärästä jakosalasanasta. Token-virheen runko on `Invalid token`.

**Token:** kirjoittavat kutsut (POST, PATCH, DELETE) vaativat otsakkeen `Authorization: Bearer <token>`. Ilman tokenia tai väärällä tokenilla vastaus on 401. Vertailu tehdään vakioajassa. Lukukutsut eivät vaadi tokenia.

### Konfiguraatio (ympäristömuuttujat)

| Muuttuja | Oletus | Merkitys |
|---|---|---|
| `JSP_LISTEN` | `:80` | Kuunteluosoite |
| `JSP_DATA_DIR` | `/var/www/data` | Jakojen hakemisto. Oletus vastaa nykyistä volume-polkua. |
| `JSP_QUOTES_FILE` | `/var/www/quotes/quotes.csv` | Lainaustiedosto (valinnainen) |
| `JSP_UPLOAD_TOKEN` / `JSP_UPLOAD_TOKEN_FILE` | – | Upload-token suoraan tai tiedostosta (Docker secrets / Infisical) |
| `JSP_ALLOW_ANONYMOUS_UPLOADS` | `false` | `true` sallii kirjoittamisen ilman tokenia (muokkaamaton upstream-plugin) |
| `JSP_MAX_BODY_BYTES` | `20 MiB` | Pyynnön maksimikoko. Kuvat upotetaan base64:nä, joten raja on reilu. |
| `JSP_TRUSTED_PROXIES` | `127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7` | CIDR-lista, jolta `X-Forwarded-For` hyväksytään asiakkaan IP:ksi (nopeusrajoitusta ja lokeja varten). Oletus kattaa Dockerin verkot, koska homelabissa Caddy (`network_mode: host`) välittää pyynnöt julkaistun portin kautta ja kontti näkee vain Docker-gatewayn IP:n. *(Suunnittelijan valinta.)* |

**Jos tokenia ei ole asetettu eikä `JSP_ALLOW_ANONYMOUS_UPLOADS=true`, palvelin kieltäytyy käynnistymästä** ja kertoo selkeästi syyn. Tokenin minimipituus on 32 merkkiä.

### Tallennus ja meta-skeema

Tiedostot pysyvät samoina: `<data>/<id>.md` ja `<data>/<id>.json`.

Vanha meta (PHP): `{"id","password","created"}`, jossa `password` on 32 hex-merkkiä selväkielisenä.

Uusi meta (Go kirjoittaa):

```json
{
  "version": 2,
  "id": "…",
  "password_sha256": "<hex>",
  "created": 1730000000,
  "updated": 1730000000,
  "expires": null,
  "encrypted": false
}
```

- **Salasanan tarkistus:** jos `password_sha256` on olemassa, verrataan SHA-256(syöte) siihen vakioajassa. Muuten verrataan vanhaan `password`-kenttään vakioajassa, ja onnistuneen tarkistuksen jälkeen meta kirjoitetaan uuteen muotoon (laiska migraatio, `password` poistetaan). SHA-256 riittää, koska salasana on palvelimen generoima 128-bittinen satunnaisluku eikä käyttäjän valitsema.
- Tuntemattomat kentät jätetään huomiotta (eteenpäin yhteensopivuus). Puuttuvat kentät tulkitaan oletusarvoiksi.
- Kirjoitukset tehdään atomisesti (väliaikainen tiedosto samaan hakemistoon, `fsync`, `rename`). Tiedosto-oikeudet `0600`, hakemisto `0700`. Rinnakkaiset kirjoitukset samaan ID:hen sarjallistetaan (mutex ID:tä kohden riittää).
- **Uudet ID:t:** 12 satunnaistavua base62- tai hex-muodossa (ei `-`- eikä `_`-merkkiä). Lyhyttä ID:tä vastaan suojaa arvaamattomuus. Vanha 4 tavun ID oli luettavissa läpi.
- **ID-validointi kaikissa kutsuissa:** `^[A-Za-z0-9]{8,64}$`, muuten 400. Tämä korvaa PHP:n `basename()`-suojauksen.

### Tietoturva (v1-korjaukset)

1. **Upload-token** kaikille kirjoituksille (yllä).
2. **`GET ?id` palautti PHP:ssä `text/html`** → selaimessa suoraan avattuna tallennettu XSS. Uusi: `text/plain; charset=utf-8` + `X-Content-Type-Options: nosniff`.
3. **Lukusivun DOM-XSS:** `index.js` upottaa virheilmoitukseen `#`-hashista luetun ID:n jQueryn `.html()`-kutsulla sellaisenaan. Lainauksen ja lähteen teksti upotetaan samoin. Korjaus: tekstisisältö (`.text()` / DOM-solmut) tai escapetus. Markdownin renderöinti säilyy DOMPurifyn kautta.
4. **Lyhyet ID:t** (32 bit) → 96 bit uusille.
5. **Selväkieliset salasanat levyllä** → SHA-256 (laiska migraatio).
6. **Ei kokorajoitusta** → `http.MaxBytesReader`. Lisäksi palvelimen `ReadHeaderTimeout`, `ReadTimeout`, `WriteTimeout` ja `IdleTimeout` asetetaan.
7. **Väärät tokenit ja salasanat:** IP-kohtainen nopeusrajoitus epäonnistuneille kirjoitusyrityksille (esim. 10/min, sitten 429). IP luetaan `X-Forwarded-For`-otsakkeesta vain `JSP_TRUSTED_PROXIES`-verkoista. **Rajoitus ei koskaan estä pyyntöä, jossa on oikea token** *(suunnittelijan valinta)*: muuten kuka tahansa voisi lukita omistajan ulos (DoS), varsinkin jos kaikki pyynnöt näyttävät tulevan samasta IP:stä. Tämä ei heikennä suojaa, koska vähintään 32 merkin tokenia ja 128-bittistä jakosalasanaa ei voi arvata raa'alla voimalla. Rajoituksen tarkoitus on vähentää kohinaa ja kuormaa. Jos asiakkaan IP:tä ei voi selvittää luotettavasti, rajoitus kohdistuu välityspalvelimen IP:hen, mikä on tämän säännön ansiosta vaaratonta.
8. **PHP:n reunatapaukset:** olemattoman ID:n PATCH/DELETE (PHP varoitti ja käytti nullia) → 404. Puuttuva tai rikkinäinen JSON-body → 400.
9. **Turvaotsakkeet lukusivulle:** `Content-Security-Policy` (skripteille ja tyyleille vain käytetyt CDN-osoitteet; **kuville `img-src 'self' data: https:`**, koska ulkopuoliset kuvat ovat käyttäjän päätöksellä sallittuja: jaot voivat linkittää kuvia verkosta, ja olemassa olevien jakojen pitää näyttää samalta. Hyväksytty kompromissi: kuvapalvelin näkee lukijan IP:n.), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (tai CSP `frame-ancestors 'none'`).
10. **CDN-skriptit:** lisätään Subresource Integrity -hashit (`integrity` + `crossorigin`) jokaiseen `<script>`- ja `<link>`-tagiin. Kirjastojen vendorointi binääriin on rakentajan valinta, jos SRI osoittautuu hankalaksi. Vendorointi on hyväksyttävää, kunhan ulkoasu ei muutu.
11. **Kontti:** ajetaan ei-root-käyttäjänä, `read_only`-juuritiedostojärjestelmä, ei shelliä imagessa.

### Docker ja homelab-yhteensopivuus

- `server/Dockerfile`: multi-stage build, lopputulos distroless/static tai scratch, `USER 33:33`. UID 33 on valittu, koska homelabin Ansible-rooli luo `data/`- ja `quotes/`-hakemistot omistajalle 33 (www-data). Näin nykyinen data toimii ilman `chown`ia. UID on dokumentoitava, ja muut hostaajat voivat ohittaa sen composessa.
- Kuuntelu `:80` ei-roottina toimii, koska Docker asettaa kontteihin oletuksena `net.ipv4.ip_unprivileged_port_start=0`. **Rakentaja tarkistaa tämän.** Jos se ei toimi, oletusportiksi vaihdetaan 8080 ja dokumentoidaan homelab-pohjan tarvitsema muutos (`127.0.0.1:{{ jsp_port }}:8080`).
- Build-konteksti pysyy `server/`-hakemistona (homelabin compose: `context: ./repo/server`).
- Homelabin terveystarkistus (`GET /` → 200) toimii edelleen.
- Homelab-puolella tarvitaan vain token-ympäristömuuttuja (ja `jsp_enabled: true`). Homelab-repon muutokset eivät kuulu tähän työhön, mutta tarvittava muutos dokumentoidaan READMEen.
- `server/docker-compose.yml` päivitetään esimerkiksi muille hostaajille (token, `read_only`, `no-new-privileges`).

### Pluginin fork

- **Plugin-id vaihdetaan** (ehdotus: `just-share-please-selfhosted`, nimi "Just Share Please (Self-hosted)"), jotta Obsidian ei päivitä forkkia upstream-versioksi. `manifest.json`:n `author`/`authorUrl`/`fundingUrl` päivitetään forkin ylläpitäjälle, ja alkuperäinen tekijä mainitaan READMEssa (MIT-lisenssi säilyy).
- **Siirtymä vanhasta pluginista:** ensimmäisellä käynnistyksellä, jos omat asetukset ovat tyhjät ja `.obsidian/plugins/just-share-please/data.json` on olemassa, plugin tarjoaa (Notice + nappi tai asetussivun nappi) asetusten ja jakolistan tuonnin. Näin vanhojen jakojen päivitys ja poisto toimivat forkissa.
- **Uusi asetus `token`** (salasanakenttä asetussivulla). Lähetetään `Authorization: Bearer <token>` POST-, PATCH- ja DELETE-kutsuissa. Oletus-URL tyhjäksi tai selkeäksi esimerkiksi (ei `jsp.ellpeck.de`).
- Virheilmoitus 401:lle selkeäksi: "Token puuttuu tai on väärä – tarkista asetukset".
- Jakelu: GitHub-releaset (`main.js`, `manifest.json`, `styles.css`), asennus BRATilla tai käsin. Release-workflow on rakentajan vastuulla.
- Upstream-palvelimen deploy-workflow `.github/workflows/server.yml` (deployaa Ellpeckin palvelimelle) korvataan CI:llä (`go vet`, `go test`, pluginin build). Poistosta kysytään käyttäjältä vahvistus.

### Testaus

- Go: yksikkötestit tallennukselle (id-validointi, atominen kirjoitus, laiska migraatio) ja `httptest`-pohjaiset rajapintatestit jokaiselle taulukon riville, mukaan lukien token-, koko- ja nopeusrajoitukset.
- **Yhteensopivuustesti:** testidataan PHP:n muodossa luotu `<id>.md` + `<id>.json` (8 hex-ID, selväkielinen salasana). GET, meta, PATCH ja DELETE toimivat, ja PATCHin jälkeen meta on uudessa muodossa.
- Käsin: `test-vault` + forkattu plugin paikallista konttia vasten: jaa, päivitä, poista, avaa linkki selaimessa, vanha linkki.

## Myöhemmät vaiheet (ei v1:ssä, mutta v1 ei saa estää niitä)

### Vaihe 2: Aikaan sidotut jaot

- POST-bodyyn valinnainen `expiresIn` (sekunteja) → meta `expires` (unix-aika).
- Vanhentunut jako palauttaa 404 kaikissa lukukutsuissa (ulospäin kuin olematon). Taustagoroutine poistaa vanhentuneet tiedostot säännöllisesti (esim. kerran tunnissa ja käynnistyksessä).
- Plugin: valinta jakaessa (ei koskaan / 1 pv / 1 vk / 30 pv) ja asetus oletukselle. Näkymässä näytetään vanhenemisaika.
- Lukusivu: alatunniste näyttää "Vanhenee: …".

### Vaihe 3: Salattu jako ja lukusalasana (yksi ominaisuus)

- Formaatti: **SimpleTextCrypt 5.x** (AES-256-GCM + Argon2id), sama kuin käyttäjän projekteissa `/home/mhavo/Dev/simplecrypter` (`src/crypter.ts`, `hash-wasm`) ja `/home/mhavo/Dev/scrpad`:
  `Base64(IV 12 B) + Base64(ciphertext || tag 16 B)`, avain = Argon2id(salasana, salt = IV, t=5, m=64 MiB, p=2, 32 B).
- Plugin salaa sisällön ennen lähetystä. Palvelin tallentaa salatun tekstin `.md`-tiedostoon ja merkitsee `encrypted: true`. **Palvelin ei koskaan näe selväkielistä sisältöä eikä salasanaa.**
- Lukusivu lukee metasta `encrypted`, kysyy salasanan ja purkaa selaimessa (sama `crypter.ts`-toteutus ja `hash-wasm`, vendoroituna tai SRI:llä). "Download Markdown" ja "Copy to Obsidian" käyttävät purettua tekstiä.
- Valinnainen: salasana linkin fragmentissa, jolloin linkki aukeaa suoraan. Erottimen on oltava jokin muu kuin `-` (ID/ankkuri-jako), eikä avainosassa saa olla `-`-merkkiä (base64url sisältää sen) tai sen on oltava koodattu. Tämä on ratkaistava ennen toteutusta.
- Salatun tekstin voi avata myös SimpleCrypterilla tai SimpleTextCrypt-Android-sovelluksella.

### Vaihe 4: Paikalliset liitekuvat erillisinä tiedostoina

- Nykyinen plugin yrittää upottaa vaultin kuvat suoraan markdowniin base64-`data:`-URI:na (`preProcessMarkdown`). Käyttäjän kokemuksen mukaan paikalliset kuvat eivät näy jaoissa lainkaan. Syy selvitetään ensin. Epäiltyjä ovat ahne regex `!\[(.*)]\((.+)\)`, välilyönti `base64, `-osan jälkeen, `image/jpg`-MIME, Obsidianin `![[kuva.png|300]]`-kokosyntaksi ja suuret kuvat vs. kokoraja. Base64-upotus kasvattaa jakoa myös noin 33 %.
- Tavoite: plugin lähettää jaon liitteet erikseen, ja palvelin tallentaa ne jaon alle (esim. `data/<id>/<hash>.<ext>` tai `data/<id>.att/`). Markdownin kuvalinkit kirjoitetaan osoittamaan palvelimen polkuun (esim. `share.php?att=<id>/<hash>`). Liitteet päivittyvät PATCHissa ja poistuvat DELETEssä jaon mukana. Vaihe 3:n salatussa jaossa liitteet salataan samalla salasanalla.
- Palvelin: sallitut MIME-tyypit (kuvat; ei SVG:tä ilman sanitointia, tai SVG `Content-Disposition: attachment`), tiedostokohtainen ja jakokohtainen kokoraja, liitteet `nosniff`-otsakkeella.
- v1:n tallennusrakenne ja ID-validointi eivät saa estää tätä (esim. `.md`/`.json`-tiedostojen rinnalle tuleva hakemisto).

## Rakentajan päätettäväksi jäävät asiat

- Go-pakettijako ja tiedostojen tarkat nimet.
- Base62 vai hex uusille ID:ille (kunhan regex ja 96 bit täyttyvät).
- Nopeusrajoituksen tarkat raja-arvot ja toteutus (pieni oma token bucket riittää).
- SRI vai kirjastojen vendorointi lukusivulle.
- Distroless vai scratch.
- Pluginin release-workflow.
