const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Autonomiczny konwerter RTF -> PDF oparty na silniku Microsoft Word COM w środowisku Windows.
 * Gwarantuje 100% bezstratną geometrię tabel, zachowanie układu i brak ingerencji w silnik SDS.
 */
class SDSRtfConverter {
  /**
   * Konwertuje plik RTF do PDF.
   * @param {string} rtfPath - Ścieżka bezwzględna do pliku źródłowego .rtf
   * @param {string} [outputPdfPath] - Opcjonalna ścieżka wyjściowa .pdf
   * @returns {Promise<string>} Ścieżka do wygenerowanego pliku PDF
   */
  static async convertToPdf(rtfPath, outputPdfPath) {
    if (!fs.existsSync(rtfPath)) {
      throw new Error(`[RTF Converter] Plik wejściowy nie istnieje: ${rtfPath}`);
    }

    const resolvedRtf = path.resolve(rtfPath);
    const resolvedPdf = outputPdfPath ? path.resolve(outputPdfPath) : resolvedRtf.replace(/\.rtf$/i, '') + `_${Date.now()}.pdf`;

    // Skrypt PowerShell sterujący Word.Application COM
    // wdFormatPDF = 17, wdDoNotSaveChanges = 0
    const psScript = `
$ErrorActionPreference = 'Stop'
$word = $null
$doc = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    
    $doc = $word.Documents.Open('${resolvedRtf.replace(/'/g, "''")}')
    $doc.SaveAs([ref]'${resolvedPdf.replace(/'/g, "''")}', [ref]17)
    $doc.Close([ref]0)
    Write-Host 'CONVERSION_SUCCESS'
} catch {
    Write-Error $_.Exception.Message
    exit 1
} finally {
    if ($doc -ne $null) {
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null
    }
    if ($word -ne $null) {
        $word.Quit([ref]0)
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
`;

    return new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
        { timeout: 30000 },
        (error, stdout, stderr) => {
          if (error) {
            console.error('[RTF Converter Error]', stderr || stdout);
            return reject(new Error(`[RTF Converter] Błąd konwersji Word COM: ${error.message} - ${stderr || stdout}`));
          }
          if (!fs.existsSync(resolvedPdf) || fs.statSync(resolvedPdf).size === 0) {
            return reject(new Error('[RTF Converter] Plik PDF nie został utworzony lub jest pusty.'));
          }
          resolve(resolvedPdf);
        }
      );
    });
  }
}

module.exports = { SDSRtfConverter };
