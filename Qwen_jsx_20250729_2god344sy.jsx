// File: src/App.jsx
import { useState, useRef, useEffect } from "react";
import { ArrowUpTrayIcon, ArrowDownTrayIcon, Trash2Icon, CheckCircleIcon, MoonIcon, SunIcon, FileIcon, FolderIcon, ZipIcon, DownloadIcon } from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import Prism from "prismjs";
import "prismjs/components/prism-sql";
import "prismjs/themes/prism-tomorrow.css";

const pako = typeof window !== "undefined" ? require("pako") : null;

const minifySQL = (sql) => {
  return sql
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/--.*$/, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
    )
    .filter((line) => line.length > 0)
    .join(" ")
    .replace(/\s+/g, " ");
};

export default function App() {
  const [files, setFiles] = useState([]);
  const [compressedFiles, setCompressedFiles] = useState({});
  const [progress, setProgress] = useState({});
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const previewRef = useRef(null);

  useEffect(() => {
    if (previewRef.current && selectedFile) {
      Prism.highlightElement(previewRef.current);
    }
  }, [selectedFile]);

  useEffect(() => {
    document.body.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  const extractFilesFromZip = async (zipFile) => {
    const zip = await JSZip.loadAsync(zipFile);
    const extracted = [];
    for (const [filename, zipEntry] of Object.entries(zip.files)) {
      if (filename.endsWith(".sql") && !zipEntry.dir) {
        const content = await zipEntry.async("string");
        const blob = new Blob([content], { type: "text/sql" });
        const file = new File([blob], filename, { lastModified: Date.now() });
        extracted.push(file);
      }
    }
    return extracted;
  };

  const handleFileChange = async (newFiles) => {
    const validFiles = [];

    for (const file of Array.from(newFiles)) {
      if (file.name.endsWith(".zip")) {
        try {
          const extracted = await extractFilesFromZip(file);
          validFiles.push(...extracted);
        } catch (err) {
          alert(`Failed to extract ${file.name}`);
        }
      } else if (file.name.endsWith(".sql")) {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) {
      alert("No valid .sql files found.");
      return;
    }

    const fileObjects = validFiles.map((file) => ({
      file,
      url: URL.createObjectURL(file),
      size: file.size,
    }));

    setFiles((prev) => [...prev, ...fileObjects]);
    if (!selectedFile) setSelectedFile(fileObjects[0]);
  };

  const handleFileUpload = (e) => handleFileChange(e.target.files);
  const handleDrop = (e) => { e.preventDefault(); setIsDragOver(false); handleFileChange(e.dataTransfer.files); };
  const handleDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);

  const removeFile = (fileName) => {
    setFiles((prev) => prev.filter((f) => f.file.name !== fileName));
    setCompressedFiles((prev) => {
      const next = { ...prev }; delete next[fileName]; return next;
    });
    setProgress((prev) => {
      const next = { ...prev }; delete next[fileName]; return next;
    });
  };

  const handleCompressAll = async () => {
    if (files.length === 0) return;
    const compressed = { ...compressedFiles };

    for (const { file } of files) {
      if (compressed[file.name]) continue;
      setProgress((p) => ({ ...p, [file.name]: 0 }));

      try {
        const text = await file.text();
        const minified = minifySQL(text);
        const gzipped = pako.gzip(new TextEncoder().encode(minified));

        compressed[file.name] = {
          blob: new Blob([gzipped], { type: "application/gzip" }),
          size: gzipped.length,
        };
        setProgress((p) => ({ ...p, [file.name]: 100 }));
      } catch (err) {
        setProgress((p) => ({ ...p, [file.name]: -1 }));
      }
    }
    setCompressedFiles(compressed);
  };

  const downloadIndividual = (name) => {
    const comp = compressedFiles[name];
    if (comp) saveAs(comp.blob, `compressed_${name}.gz`);
  };

  const downloadAllAsZip = async () => {
    const zip = new JSZip();
    Object.entries(compressedFiles).forEach(([name, { blob }]) => {
      zip.file(`compressed_${name}.gz`, blob);
    });
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "sql_compressed.zip");
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const totalOriginal = files.reduce((sum, f) => sum + f.size, 0);
  const totalCompressed = Object.values(compressedFiles).reduce((sum, f) => sum + f.size, 0);
  const savings = totalOriginal > 0 ? ((1 - totalCompressed / totalOriginal) * 100).toFixed(1) : 0;

  return (
    <div className={`min-h-screen transition-colors ${isDarkMode ? "bg-slate-900 text-slate-100" : "bg-gradient-to-br from-slate-50 to-slate-100 text-slate-800"}`}>
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <h1 className="text-3xl font-extrabold bg-gradient-to-r from-blue-500 to-purple-600 dark:from-blue-400 dark:to-purple-500 bg-clip-text text-transparent">
            SQL Compressor Pro
          </h1>
          <button onClick={() => setIsDarkMode(!isDarkMode)} className={`mt-4 sm:mt-0 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium ${isDarkMode ? "bg-yellow-500 text-slate-900" : "bg-slate-800 text-white"}`}>
            {isDarkMode ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />} {isDarkMode ? "Light Mode" : "Dark Mode"}
          </button>
        </header>

        <div onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave} className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer ${isDragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-slate-400"}`}>
          <ArrowUpTrayIcon className="w-12 h-12 mx-auto text-slate-400 mb-4" />
          <p className="font-semibold">Drop .sql or .zip files here</p>
          <p className="text-sm text-slate-500">ZIPs auto-extracted</p>
          <input type="file" accept=".sql,.zip" multiple className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileUpload} />
        </div>

        {files.length > 0 && (
          <div className="mt-6 bg-white dark:bg-slate-800 rounded-xl shadow overflow-hidden">
            <div className="p-4 border-b flex items-center gap-2">
              <FolderIcon className="w-5 h-5" />
              <h2 className="font-semibold">Files ({files.length})</h2>
            </div>
            <ul className="divide-y dark:divide-slate-700">
              {files.map(({ file, size }) => {
                const prog = progress[file.name];
                return (
                  <li key={file.name} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-700">
                    <div className="flex items-center justify-between">
                      <div onClick={() => setSelectedFile({ file, url: URL.createObjectURL(file), size })} className="flex items-center gap-3 cursor-pointer">
                        <FileIcon className="w-5 h-5 text-blue-500" />
                        <div>
                          <p className="font-medium">{file.name}</p>
                          <p className="text-sm text-slate-500">{formatSize(size)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {compressedFiles[file.name] ? (
                          <button onClick={() => downloadIndividual(file.name)} className="text-green-600">
                            <DownloadIcon className="w-5 h-5" />
                          </button>
                        ) : null}
                        <button onClick={() => removeFile(file.name)} className="text-red-500">
                          <Trash2Icon className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    {prog !== undefined && (
                      <div className="mt-2">
                        {prog === -1 ? <span className="text-red-500 text-xs">Error</span> : (
                          <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-blue-600 h-2 rounded-full" style={{ width: `${prog}%` }}></div></div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {files.length > 0 && Object.keys(compressedFiles).length < files.length && (
          <button onClick={handleCompressAll} className="mt-6 w-full bg-gradient-to-r from-blue-600 to-purple-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2">
            <ArrowDownTrayIcon className="w-5 h-5" /> Compress All
          </button>
        )}

        {selectedFile && (
          <div className="mt-8 bg-white dark:bg-slate-800 rounded-xl shadow overflow-hidden">
            <div className="p-4 border-b"><h2 className="font-semibold">Preview: {selectedFile.file.name}</h2></div>
            <div className="p-4 max-h-60 overflow-y-auto">
              <pre className="language-sql"><code ref={previewRef} className="language-sql">{selectedFile.file.text ? await selectedFile.file.text() : ""}</code></pre>
            </div>
          </div>
        )}

        {Object.keys(compressedFiles).length > 0 && (
          <div className="mt-8 bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
            <div className="flex items-center text-green-600 mb-4">
              <CheckCircleIcon className="w-6 h-6 mr-2" />
              <h2 className="text-lg font-semibold">Compression Complete!</h2>
            </div>
            <div className="space-y-2 text-sm mb-4">
              <p><strong>Original:</strong> {formatSize(totalOriginal)}</p>
              <p><strong>Compressed:</strong> {formatSize(totalCompressed)}</p>
              <p><strong>Saved:</strong> <span className="font-medium text-green-600">{savings}%</span></p>
            </div>
            <button onClick={downloadAllAsZip} className="w-full bg-gradient-to-r from-green-600 to-emerald-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2">
              <ZipIcon className="w-5 h-5" /> Download All as ZIP
            </button>
          </div>
        )}
      </div>
    </div>
  );
}