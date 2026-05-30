const express= require("express");
const path= require("path");
const fs=require("fs");
const sass=require("sass");

app= express();
app.set("view engine", "ejs")



obGlobal={
    obErori:null,
    obImagini:null,
    folderScss: path.join(__dirname,"resurse/scss"),
    folderCss: path.join(__dirname,"resurse/css"),
    folderBackup: path.join(__dirname,"backup"),
}

console.log("Folder index.js", __dirname);
console.log("Folder curent (de lucru)", process.cwd());
console.log("Cale fisier", __filename);

let vect_foldere=[ "temp", "logs", "backup", "fisiere_uploadate" ]
for (let folder of vect_foldere){
    let caleFolder=path.join(__dirname, folder);
    if (!fs.existsSync(caleFolder)) {
        fs.mkdirSync(path.join(caleFolder), {recursive:true});   
    }
}

app.use("/resurse",express.static(path.join(__dirname, "resurse")));

app.get("/favicon.ico", function(req, res){
    res.sendFile(path.join(__dirname,"resurse/imagini/favicon/favicon.ico"))
});

app.get(["/", "/index","/home"], function(req, res){
    res.render("pagini/index", {
        ip: req.ip
    });
});

 app.get("/despre", function(req, res){
     res.render("pagini/despre");
 });




// Parcurge textul brut al JSON-ului caracter cu caracter si detecteaza
// chei duplicate in cadrul aceluiasi obiect (JSON.parse le-ar suprascrie silentios)
function detecteazaCheiDuplicate(textBrut) {
    const duplicate = [];
    const stiva = []; // fiecare element = lista de chei din obiectul curent
    let i = 0;
    const n = textBrut.length;

    while (i < n) {
        const c = textBrut[i];

        if (c === '{') {
            stiva.push([]);
            i++;
            continue;
        }
        if (c === '}') {
            stiva.pop();
            i++;
            continue;
        }
        if (c === '"') {
            // citim sirul pana la ghilimelele de inchidere, cu suport escape
            let j = i + 1;
            while (j < n) {
                if (textBrut[j] === '\\') { j += 2; continue; }
                if (textBrut[j] === '"') break;
                j++;
            }
            const sir = textBrut.substring(i + 1, j);
            // sarim spatiile dupa ghilimele si verificam daca urmeaza ':'
            let k = j + 1;
            while (k < n && ' \t\n\r'.includes(textBrut[k])) k++;

            if (textBrut[k] === ':' && stiva.length > 0) {
                const obCurent = stiva[stiva.length - 1];
                if (obCurent.includes(sir)) {
                    duplicate.push(sir);
                } else {
                    obCurent.push(sir);
                }
            }
            i = j + 1;
            continue;
        }
        i++;
    }
    return [...new Set(duplicate)];
}

function valideazaEroriJson() {
    const caleJson = path.join(__dirname, "resurse/json/erori.json");

    // 1. Verificare existenta fisier
    if (!fs.existsSync(caleJson)) {
        console.error("[ERORI JSON] FATAL: Fisierul erori.json NU exista! Calea asteptata:", caleJson);
        process.exit(1);
    }

    // 2. Citire text brut + detectare chei duplicate
    const textBrut = fs.readFileSync(caleJson, "utf-8");
    const cheiDuplicate = detecteazaCheiDuplicate(textBrut);
    if (cheiDuplicate.length > 0) {
        console.warn("[ERORI JSON] ATENTIE: Chei duplicate detectate in JSON:", cheiDuplicate.join(", "));
    } else {
        console.log("[ERORI JSON] OK: Nu s-au gasit chei duplicate.");
    }

    // 3. Parsare JSON + verificare proprietati obligatorii de baza
    let erori;
    try {
        erori = JSON.parse(textBrut);
    } catch (e) {
        console.error("[ERORI JSON] FATAL: JSON malformat!", e.message);
        process.exit(1);
    }

    for (const prop of ["info_erori", "cale_baza", "eroare_default"]) {
        if (erori[prop] === undefined || erori[prop] === null) {
            console.warn(`[ERORI JSON] ATENTIE: Proprietatea de baza "${prop}" lipseste!`);
        }
    }

    // 4. Verificare proprietati din eroare_default
    if (erori.eroare_default) {
        for (const prop of ["titlu", "text", "imagine"]) {
            if (!erori.eroare_default[prop]) {
                console.warn(`[ERORI JSON] ATENTIE: eroare_default.${prop} lipseste!`);
            }
        }
    }

    // 5. Verificare existenta fizica a folderului cale_baza pe disc
    if (erori.cale_baza) {
        const caleBazaRel = erori.cale_baza.replace(/^\//, '');
        const caleAbsBaza = path.join(__dirname, caleBazaRel);
        if (!fs.existsSync(caleAbsBaza)) {
            console.warn(`[ERORI JSON] ATENTIE: Folderul cale_baza nu exista pe disc: ${caleAbsBaza}`);
        } else {
            console.log(`[ERORI JSON] OK: Folderul cale_baza exista: ${caleAbsBaza}`);
        }
    }

    // 6. Verificare existenta fizica a imaginilor (eroare_default + info_erori)
    if (erori.cale_baza) {
        const caleBazaRel = erori.cale_baza.replace(/^\//, '');

        const toateErorile = [...(erori.info_erori || [])];
        if (erori.eroare_default) toateErorile.push({ identificator: "default", ...erori.eroare_default });

        for (const eroare of toateErorile) {
            if (eroare.imagine) {
                const caleImagine = path.join(__dirname, caleBazaRel, eroare.imagine);
                if (!fs.existsSync(caleImagine)) {
                    console.warn(`[ERORI JSON] ATENTIE: Imaginea pentru eroarea [${eroare.identificator}] nu exista pe disc: ${caleImagine}`);
                }
            }
        }
    }

    // 7. Detectare identificatori duplicati in info_erori
    if (erori.info_erori) {
        const grupuriId = {};
        for (const eroare of erori.info_erori) {
            const id = eroare.identificator;
            if (!grupuriId[id]) grupuriId[id] = [];
            grupuriId[id].push(eroare);
        }
        for (const [id, lista] of Object.entries(grupuriId)) {
            if (lista.length > 1) {
                console.warn(`[ERORI JSON] ATENTIE: Identificatorul "${id}" apare de ${lista.length} ori! Erorile afectate (fara camp identificator):`);
                for (const { identificator, ...restul } of lista) {
                    console.warn("  ->", JSON.stringify(restul));
                }
            }
        }
    }

    console.log("[ERORI JSON] Validare JSON erori finalizata.");
}
valideazaEroriJson();

function initErori(){
    let continut = fs.readFileSync(path.join(__dirname,"resurse/json/erori.json")).toString("utf-8");
    let erori=obGlobal.obErori=JSON.parse(continut)
    let err_default=erori.eroare_default
    err_default.imagine=path.join(erori.cale_baza, err_default.imagine)
    for (let eroare of erori.info_erori){
        eroare.imagine=path.join(erori.cale_baza, eroare.imagine)
    }

}
initErori()


function afisareEroare(res, identificator, titlu, text, imagine){
    //TO DO cautam eroarea dupa identificator
    let eroare= obGlobal.obErori.info_erori.find((elem) => 
        elem.identificator == identificator
    )
    //daca sunt setate titlu, text, imagine, le folosim, 
    //altfel folosim cele din fisierul json pentru eroarea gasita
    //daca nu o gasim, afisam eroarea default
    let errDefault= obGlobal.obErori.eroare_default;
    if(eroare?.status)
        res.status(eroare.identificator)
    res.render("pagini/eroare",{
        imagine: imagine || eroare?.imagine || errDefault.imagine,
        titlu: titlu || eroare?.titlu || errDefault.titlu,
        text: text || eroare?.text || errDefault.text,
    });

}


app.get("/eroare", function(req, res){
    afisareEroare(res,404, "Titlu!!!")
});



function compileazaScss(caleScss, caleCss){
    if(!caleCss){

        let numeFisExt=path.basename(caleScss); // "folder1/folder2/a.scss" -> "a.scss"
        let numeFis=numeFisExt.split(".")[0]   /// "a.scss"  -> ["a","scss"]
        caleCss=numeFis+".css"; // output: a.css
    }
    
    if (!path.isAbsolute(caleScss))
        caleScss=path.join(obGlobal.folderScss,caleScss )
    if (!path.isAbsolute(caleCss))
        caleCss=path.join(obGlobal.folderCss,caleCss )
    
    let caleBackup=path.join(obGlobal.folderBackup, "resurse/css");
    if (!fs.existsSync(caleBackup)) {
        fs.mkdirSync(caleBackup,{recursive:true})
    }
    
    // la acest punct avem cai absolute in caleScss si  caleCss

    let numeFisCss=path.basename(caleCss);
    if (fs.existsSync(caleCss)){
        fs.copyFileSync(caleCss, path.join(obGlobal.folderBackup, "resurse/css",numeFisCss ))// +(new Date()).getTime()
    }
    rez=sass.compile(caleScss, {"sourceMap":true});
    fs.writeFileSync(caleCss,rez.css)
    
}


//la pornirea serverului
vFisiere=fs.readdirSync(obGlobal.folderScss);
for( let numeFis of vFisiere ){
    if (path.extname(numeFis)==".scss"){
        compileazaScss(numeFis);
    }
}


fs.watch(obGlobal.folderScss, function(eveniment, numeFis){
    if (eveniment=="change" || eveniment=="rename"){
        let caleCompleta=path.join(obGlobal.folderScss, numeFis);
        if (fs.existsSync(caleCompleta)){
            compileazaScss(caleCompleta);
        }
    }
})


app.get("/*pagina", function(req, res){
    console.log("Cale pagina", req.url);
    if (req.url.startsWith("/resurse") && path.extname(req.url)==""){
        afisareEroare(res,403);
        return;
    }
    if (path.extname(req.url)==".ejs"){
        afisareEroare(res,400);
        return;
    }
    try{
        res.render("pagini"+req.url, function(err, rezRandare){
            if (err){
                if (err.message.includes("Failed to lookup view")){
                    afisareEroare(res,404)
                }
                else{
                    afisareEroare(res);
                }
            }
            else{
                res.send(rezRandare);
                console.log("Rezultat randare", rezRandare);
            }
        });
    }
    catch(err){
        if (err.message.includes("Cannot find module")){
            afisareEroare(res,404)
        }
        else{
            afisareEroare(res);
        }
    }
});


app.listen(8080);
console.log("Serverul a pornit!");