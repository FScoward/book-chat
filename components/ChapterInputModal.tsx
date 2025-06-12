
import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import { XMarkIcon, DocumentArrowUpIcon } from './Icons'; 
import LoadingSpinner from './LoadingSpinner';
import { ChapterWithContent } from '../services/geminiService';

interface ChapterInputModalProps {
  onAddChapter: (title: string, content: string) => void;
  onAddChaptersBatch: (chapters: ChapterWithContent[]) => void;
  onClose: () => void;
}

const MAX_TITLE_LENGTH = 200; 
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml'];

type ManifestItem = { href: string; mediaType: string; id: string };
type TocItem = { title: string | null; filePath: string | null; anchor?: string };

const ChapterInputModal: React.FC<ChapterInputModalProps> = ({ onAddChapter, onAddChaptersBatch, onClose }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState(''); 
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessingFile) return; 

    if (!title.trim()) {
      setError('章のタイトルは必須です。');
      setInfoMessage(null);
      return;
    }
    if (!content.trim()) { 
      setError('章の内容は必須です。内容を編集するか、EPUBをアップロードしてください。');
      setInfoMessage(null);
      return;
    }
    setError('');
    onAddChapter(title, content); 
    
    setTitle('');
    setContent(''); 
    setInfoMessage("章が手動で追加されました。次の章のタイトルと内容を入力するか、EPUBから自動抽出を実行してください。");
  };

  const getAbsolutePath = (base: string, relative: string): string => {
    const baseParts = base.split('/');
    baseParts.pop(); 
    const relativeParts = relative.split('/');
    
    for (const part of relativeParts) {
        if (part === '..') {
            if (baseParts.length > 0) baseParts.pop();
        } else if (part !== '.' && part !== '') { // Ensure empty parts (e.g. from leading slash) are not pushed
            baseParts.push(part);
        }
    }
    return baseParts.join('/');
  };


  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/epub+zip') {
      setError('無効なファイルタイプです。EPUBファイル (.epub) をアップロードしてください。');
      setInfoMessage(null);
      if(fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setError('');
    setInfoMessage(null);
    setIsProcessingFile(true);
    
    const fileNameWithoutExtension = file.name.replace(/\.epub$/i, '');
    let tocPath: string | null = null;
    let tocMediaType: string | null = null;
    let tocItemsFound = false;

    try {
      console.log(`EPUB処理開始: ${file.name}`);
      setInfoMessage("EPUBファイルを解析中...");
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      console.log("META-INF/container.xml を検索中...");
      const containerFile = zip.file("META-INF/container.xml");
      if (!containerFile) throw new Error("META-INF/container.xml がEPUB内に見つかりません。");
      const containerXmlText = await containerFile.async("string");
      const parser = new DOMParser();
      const containerDoc = parser.parseFromString(containerXmlText, "application/xml");
      const rootfilePath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
      if (!rootfilePath) throw new Error("OPFファイルのパスがcontainer.xml内で見つかりません。");
      
      setInfoMessage("OPFファイルを解析中...");
      const opfFile = zip.file(rootfilePath);
      if (!opfFile) throw new Error(`OPFファイル (${rootfilePath}) がEPUB内に見つかりません。`);
      const opfXmlText = await opfFile.async("string");
      const opfDoc = parser.parseFromString(opfXmlText, "application/xml");
      
      const dcTitle = opfDoc.querySelector("metadata > dc\\:title")?.textContent;
      if (!title.trim() || title === fileNameWithoutExtension) {
        setTitle(dcTitle || fileNameWithoutExtension); 
      }
      console.log(`EPUBタイトル (dc:title): ${dcTitle || `見つかりません、ファイル名を使用: ${fileNameWithoutExtension}`}`);

      const manifestById: { [id: string]: ManifestItem } = {};
      const manifestByHref: { [resolvedHref: string]: ManifestItem } = {};
      const manifestItems = opfDoc.querySelectorAll("manifest > item");
      manifestItems.forEach(itemNode => {
        const id = itemNode.getAttribute("id");
        const href = itemNode.getAttribute("href");
        const mediaType = itemNode.getAttribute("media-type");
        if (id && href && mediaType) {
          const resolvedHref = getAbsolutePath(rootfilePath, href);
          const manifestEntry = { href: resolvedHref, mediaType, id };
          manifestById[id] = manifestEntry;
          manifestByHref[resolvedHref] = manifestEntry;
        }
      });
      console.log(`マニフェスト解析完了: ${Object.keys(manifestById).length} 個のアイテム`);

      const navItem = Array.from(manifestItems).find(item => item.getAttribute("properties")?.includes("nav"));
      if (navItem) {
          const navItemId = navItem.getAttribute("id");
          if (navItemId && manifestById[navItemId] && (manifestById[navItemId].mediaType === 'application/xhtml+xml' || manifestById[navItemId].mediaType === 'text/html')) {
              tocPath = manifestById[navItemId].href;
              tocMediaType = manifestById[navItemId].mediaType;
          }
      }
      
      if (!tocPath) { 
          const ncxItemId = opfDoc.querySelector("spine")?.getAttribute("toc");
          if (ncxItemId && manifestById[ncxItemId]) {
              if (manifestById[ncxItemId].mediaType === 'application/x-dtbncx+xml' || manifestById[ncxItemId].mediaType === 'application/xhtml+xml' || manifestById[ncxItemId].mediaType === 'text/html') {
                  tocPath = manifestById[ncxItemId].href;
                  tocMediaType = manifestById[ncxItemId].mediaType;
              }
          } else { 
              const ncxManifestEntry = Object.values(manifestById).find(m => m.mediaType === 'application/x-dtbncx+xml');
              if (ncxManifestEntry) {
                  tocPath = ncxManifestEntry.href;
                  tocMediaType = ncxManifestEntry.mediaType;
              }
          }
      }

      if (tocPath && tocMediaType) {
        setInfoMessage(`目次ファイル (${tocPath}) を解析中...`);
      }

      const chaptersWithContent: ChapterWithContent[] = [];
      const itemsToProcess: TocItem[] = []; // Store TOC items for anchor processing

      const processHtmlStringAndEmbedImages = async (
          htmlString: string, 
          htmlFilePath: string, // Absolute path within ZIP for this HTML file
          zipFile: JSZip,
          currentManifestByHref: { [resolvedHref: string]: ManifestItem }
        ): Promise<string> => {
        const domParser = new DOMParser();
        const doc = domParser.parseFromString(htmlString, 'text/html'); // Parse the potentially partial HTML
        const images = doc.querySelectorAll('img');

        for (const img of Array.from(images)) {
            const originalSrc = img.getAttribute('src');
            if (!originalSrc || originalSrc.startsWith('data:')) continue;

            const imageAbsPath = getAbsolutePath(htmlFilePath, originalSrc);
            const imageManifestEntry = currentManifestByHref[imageAbsPath];

            if (imageManifestEntry && SUPPORTED_IMAGE_TYPES.includes(imageManifestEntry.mediaType)) {
                const imageFile = zipFile.file(imageAbsPath);
                if (imageFile) {
                    try {
                        const base64Data = await imageFile.async('base64');
                        img.setAttribute('src', `data:${imageManifestEntry.mediaType};base64,${base64Data}`);
                        console.log(`  画像埋め込み成功: ${imageAbsPath} (元src: ${originalSrc})`);
                    } catch (imgError) {
                        console.error(`  画像ファイルのBase64エンコード失敗: ${imageAbsPath}`, imgError);
                    }
                } else {
                    console.warn(`  画像ファイルがZip内に見つかりません: ${imageAbsPath} (元src: ${originalSrc})`);
                }
            } else {
                 console.warn(`  画像のマニフェストエントリが見つからないか未対応タイプ: ${imageAbsPath} (元src: ${originalSrc}, mediaType: ${imageManifestEntry?.mediaType})`);
            }
        }
        // If the input htmlString was a fragment, doc.body.innerHTML will give its content.
        // If it was a full doc, doc.documentElement.outerHTML is better.
        // For consistency, let's aim for a full HTML structure for the chapter content string.
        if (doc.body && !doc.documentElement.querySelector('body')) { // If body exists but not in documentElement (e.g. fragment parsed)
            const htmlEl = doc.createElement('html');
            const headEl = doc.createElement('head');
             // Optionally add a base tag if needed for very relative links, but usually not for EPUB content display
            // const baseEl = doc.createElement('base');
            // baseEl.href = htmlFilePath.substring(0, htmlFilePath.lastIndexOf('/') + 1);
            // headEl.appendChild(baseEl);
            htmlEl.appendChild(headEl);
            htmlEl.appendChild(doc.body);
            return htmlEl.outerHTML;
        }
        return doc.documentElement?.outerHTML || doc.body?.innerHTML || htmlString;
      };

      if (tocPath && tocMediaType) {
        const tocFile = zip.file(tocPath);
        if (!tocFile) throw new Error(`目次ファイル (${tocPath}) がEPUB内に見つかりません。`);
        const tocXmlText = await tocFile.async("string");
        const tocDoc = parser.parseFromString(tocXmlText, tocMediaType === "application/xhtml+xml" || tocMediaType === "text/html" ? "application/xhtml+xml" : "application/xml");

        if (tocMediaType === "application/x-dtbncx+xml") { 
          console.log("NCX目次解析開始...");
          const navPoints = tocDoc.querySelectorAll("navMap > navPoint");
          if (navPoints.length > 0) tocItemsFound = true;
          navPoints.forEach(navPoint => {
            const chapterTitleText = navPoint.querySelector("navLabel > text")?.textContent?.trim() || "無題の章";
            const contentSrcRaw = navPoint.querySelector("content")?.getAttribute("src");
            const contentSrcParts = contentSrcRaw ? contentSrcRaw.split('#') : [null, null];
            itemsToProcess.push({
                title: chapterTitleText,
                filePath: contentSrcParts[0] ? getAbsolutePath(tocPath, contentSrcParts[0]) : null,
                anchor: contentSrcParts[1] || undefined
            });
          });
        } else if (tocMediaType === "application/xhtml+xml" || tocMediaType === "text/html") { 
          console.log("EPUB3 NAV目次解析開始...");
          let navLinks = Array.from(tocDoc.querySelectorAll("nav[epub\\:type='toc'] a, nav[role~='doc-toc'] a"));
          if (navLinks.length === 0) { 
            navLinks = Array.from(tocDoc.querySelectorAll("body ol a, body ul a")); // Fallback
          }
          if (navLinks.length > 0) tocItemsFound = true;
          navLinks.forEach(link => {
            const chapterTitleText = link.textContent?.trim() || "無題の章";
            const hrefRaw = link.getAttribute("href");
            const hrefParts = hrefRaw ? hrefRaw.split('#') : [null, null];
            itemsToProcess.push({
                title: chapterTitleText,
                filePath: hrefParts[0] ? getAbsolutePath(tocPath, hrefParts[0]) : null,
                anchor: hrefParts[1] || undefined
            });
          });
        }
        
        let processedCount = 0;
        for (const item of itemsToProcess) {
          let chapterTitleText = item.title;
          if (chapterTitleText && chapterTitleText.length > MAX_TITLE_LENGTH) {
            chapterTitleText = chapterTitleText.substring(0, MAX_TITLE_LENGTH) + "...";
          }

          if (chapterTitleText && item.filePath) {
            const chapterFile = zip.file(item.filePath);
            if (chapterFile) {
              const fullFileHtml = await chapterFile.async("string");
              let chapterSpecificContent = fullFileHtml; // Default to full content

              if (item.anchor) {
                console.log(`  アンカー '${item.anchor}' を持つ章 '${item.title}' を処理中、ファイル: ${item.filePath}`);
                const tempParser = new DOMParser();
                const tempDoc = tempParser.parseFromString(fullFileHtml, 'text/html');
                const anchoredElement = tempDoc.getElementById(item.anchor);

                if (anchoredElement) {
                  let extractedHtml = '';
                  const parentOfAnchor = anchoredElement.parentElement;

                  if (parentOfAnchor) {
                      let currentNode: Element | null = anchoredElement;
                      const elementsForSection: Element[] = [];

                      while (currentNode) {
                          elementsForSection.push(currentNode);
                          const nextEl = currentNode.nextElementSibling;
                          if (!nextEl) break; 

                          const nextElId = nextEl.id;
                          // Check if nextEl is an anchor for *another* TOC item within the same file
                          const isNextElDifferentAnchor = itemsToProcess.some(
                              tocItem => tocItem.filePath === item.filePath && tocItem.anchor && tocItem.anchor === nextElId && tocItem.anchor !== item.anchor
                          );
                          const isNextElHeading = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(nextEl.tagName.toUpperCase());

                          if (isNextElHeading || isNextElDifferentAnchor) {
                              break;
                          }
                          currentNode = nextEl;
                      }
                      
                      const tempDiv = tempDoc.createElement('div');
                      elementsForSection.forEach(el => tempDiv.appendChild(el.cloneNode(true)));
                      extractedHtml = tempDiv.innerHTML;
                  } else {
                       extractedHtml = anchoredElement.outerHTML; // Fallback: just the element itself
                  }
                  
                  if (extractedHtml.trim()) {
                      chapterSpecificContent = extractedHtml;
                      console.log(`    アンカー '${item.anchor}' の内容を抽出。新コンテンツ長: ${chapterSpecificContent.length}`);
                  } else {
                      console.warn(`    アンカー '${item.anchor}' から抽出された内容が空です。ファイル全体を使用します。`);
                  }
                } else { 
                  console.warn(`    アンカー ID '${item.anchor}' がファイル '${item.filePath}' 内に見つかりませんでした。ファイル全体を使用します。`);
                }
              }
              
              const contentWithEmbeddedImages = await processHtmlStringAndEmbedImages(chapterSpecificContent, item.filePath, zip, manifestByHref);
              
              chaptersWithContent.push({ 
                title: chapterTitleText, 
                content: contentWithEmbeddedImages,
                isHtmlContent: true 
              });
              processedCount++;
            } else {
              console.warn(`  章ファイルが見つかりません: ${item.filePath} (タイトル: ${chapterTitleText})`);
              chaptersWithContent.push({ title: chapterTitleText, content: `<p>(内容ファイル ${item.filePath} が見つかりません)</p>`, isHtmlContent: true });
            }
          } else {
            console.warn("  目次アイテムにタイトルまたは有効なファイルパスがありませんでした。スキップします。", item);
          }
        }
        console.log(`目次から ${processedCount} 個の章を処理しました。`);
      }


      if (chaptersWithContent.length === 0) {
        let specificError = "";
        if (!tocPath || !tocMediaType) { 
             specificError = "EPUBから目次ファイル (NCX または NAV) を特定できませんでした。";
        } else if (tocPath && !tocItemsFound) { 
             specificError = `EPUBの目次ファイル (${tocPath}) は読み込めましたが、章項目を抽出できませんでした。`;
        } else { 
             specificError = "EPUB目次から章のタイトルや内容を抽出できませんでした。";
        }
        setError(specificError + " OPFと目次構造を確認してください。ログに詳細がある場合があります。");
        setInfoMessage(null);
      } else {
        onAddChaptersBatch(chaptersWithContent);
        setInfoMessage(`${chaptersWithContent.length}個の章がEPUBから抽出・追加されました。画像も含まれている可能性があります。モーダルを閉じて内容を確認してください。`);
        setContent(''); 
        
        let shouldAutoClose = true;
        if (error) { 
            const criticalErrorKeywords = ["特定できませんでした", "抽出できませんでした", "見つかりません"];
            if (criticalErrorKeywords.some(keyword => error.includes(keyword))) {
                shouldAutoClose = false;
            }
        }
        if (shouldAutoClose && !error) {
            setTimeout(() => {
                if (!isProcessingFile && infoMessage && infoMessage.includes("抽出・追加されました") && !error) {
                    onClose();
                }
            }, 1500); 
        }
      }

    } catch (e) {
      console.error("EPUB解析エラーの詳細:", e);
      const errorMessage = e instanceof Error ? `EPUB処理エラー：${e.message}` : "EPUBの処理中に予期せぬエラーが発生しました。";
      setError(errorMessage + " 詳細は開発者コンソールを確認してください。");
      setInfoMessage(null);
    } finally {
      setIsProcessingFile(false);
      if(fileInputRef.current) fileInputRef.current.value = ""; 
      console.log("EPUB処理完了。");
    }
  };
  
  const currentContentPlaceholder = () => {
    if (isProcessingFile) return "EPUBから章を抽出中...";
    return "ここに章のテキストを貼り付けるか、EPUBをアップロードしてください（手動追加用）。";
  };
  
  const manualSubmitButtonText = "手動でこの章を追加";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 transition-opacity duration-300 ease-in-out">
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-2xl relative transform transition-all duration-300 ease-in-out scale-100 flex flex-col max-h-[90vh]">
        <button
          onClick={() => {
            if (!isProcessingFile) onClose();
          }}
          disabled={isProcessingFile}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50"
          aria-label="モーダルを閉じる"
        >
          <XMarkIcon className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-semibold text-sky-400 mb-4">新しい章を追加</h2>
        
        {error && <p className="text-red-400 text-sm mb-3 bg-red-900 bg-opacity-25 p-3 rounded-md whitespace-pre-wrap" role="alert">{error}</p>}
        {infoMessage && !error && (
            <div className="text-sky-300 text-sm mb-3 bg-sky-800 bg-opacity-50 p-3 rounded-md whitespace-pre-wrap" role="status">
              {infoMessage}
            </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4 flex-grow flex flex-col overflow-hidden">
          <div>
            <label htmlFor="chapterTitle" className="block text-sm font-medium text-gray-300 mb-1">
              章のタイトル (手動追加／EPUBからのメインタイトル)
            </label>
            <input
              type="text"
              id="chapterTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-gray-700 text-gray-100 border border-gray-600 rounded-md p-2.5 focus:ring-sky-500 focus:border-sky-500 shadow-sm"
              placeholder="例：第1章：始まり（EPUBアップロードで自動入力される場合あり）"
              disabled={isProcessingFile}
            />
          </div>

          <div className="mb-1 space-y-3">
            <div>
                <label htmlFor="epubUpload" className="block text-sm font-medium text-gray-300 mb-1">
                EPUBをアップロード (章と画像の自動抽出用)
                </label>
                <div className="flex items-center space-x-2">
                    <input
                        type="file"
                        id="epubUpload"
                        accept=".epub,application/epub+zip"
                        onChange={handleFileChange}
                        className="hidden" 
                        ref={fileInputRef}
                        aria-describedby="epubUploadHelp"
                        disabled={isProcessingFile}
                    />
                    <button 
                        type="button" 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isProcessingFile}
                        className="flex items-center px-4 py-2 bg-indigo-500 text-white hover:bg-indigo-600 rounded-md transition-colors shadow disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                        <DocumentArrowUpIcon className="w-5 h-5 mr-2"/>
                        {isProcessingFile ? "EPUB処理中..." : "EPUBを選択"}
                    </button>
                    {(isProcessingFile) && <LoadingSpinner size="sm" color="text-indigo-400"/>}
                </div>
                <p id="epubUploadHelp" className="mt-1 text-xs text-gray-400">
                EPUBをアップロードすると、章が自動的に抽出されリストに追加されます。画像も可能な範囲で埋め込まれます。
                </p>
            </div>
          </div>
          
          <div className="flex-grow flex flex-col overflow-hidden pt-2">
            <label htmlFor="chapterContent" className="block text-sm font-medium text-gray-300 mb-1">
              章の内容 (手動追加用)
            </label>
            <textarea
              id="chapterContent"
              value={content} 
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="w-full bg-gray-700 text-gray-100 border border-gray-600 rounded-md p-2.5 focus:ring-sky-500 focus:border-sky-500 shadow-sm flex-grow overflow-y-auto"
              placeholder={currentContentPlaceholder()}
              disabled={isProcessingFile}
              aria-label="章の内容"
            />
          </div>
          
          <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 pt-3 border-t border-gray-700">
            <button
              type="button"
              onClick={() => {
                 if (!isProcessingFile) onClose();
              }}
              disabled={isProcessingFile}
              className="px-4 py-2 text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md transition-colors shadow disabled:opacity-50 disabled:cursor-not-allowed order-last sm:order-first"
            >
              キャンセル / 完了
            </button>
            <button
              type="submit"
              disabled={isProcessingFile || !title.trim() || !content.trim()}
              className="px-4 py-2 bg-sky-500 text-white hover:bg-sky-600 rounded-md transition-colors shadow-md disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {manualSubmitButtonText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChapterInputModal;
