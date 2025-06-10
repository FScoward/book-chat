
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
        } else if (part !== '.') {
            baseParts.push(part);
        }
    }
    return baseParts.join('/');
  };


  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setContent('');
      setTitle('');
      setError('');
      setInfoMessage(null);
      return;
    }

    if (file.type !== 'application/epub+zip') {
      setError('無効なファイルタイプです。EPUBファイル (.epub) をアップロードしてください。');
      setContent('');
      setTitle('');
      setInfoMessage(null);
      return;
    }

    setError('');
    setInfoMessage(null);
    setIsProcessingFile(true);
    setContent(''); 

    const fileNameWithoutExtension = file.name.replace(/\.epub$/i, '');
    
    let tocPath: string | null = null;
    let tocMediaType: string | null = null;
    let tocItemsFound = false;

    try {
      console.log(`EPUB処理開始: ${file.name} (タイプ: ${file.type}, サイズ: ${file.size} bytes)`);
      setInfoMessage("EPUBファイルを解析中...");
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      console.log("META-INF/container.xml を検索中...");
      const containerFile = zip.file("META-INF/container.xml");
      if (!containerFile) throw new Error("META-INF/container.xml がEPUB内に見つかりません。");
      const containerXmlText = await containerFile.async("string");
      console.debug("container.xml 内容 (先頭500文字):", containerXmlText.substring(0, 500) + (containerXmlText.length > 500 ? "..." : ""));
      const parser = new DOMParser();
      const containerDoc = parser.parseFromString(containerXmlText, "application/xml");
      const rootfilePath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
      if (!rootfilePath) throw new Error("OPFファイルのパスがcontainer.xml内で見つかりません。");
      console.log(`OPFファイルのパス: ${rootfilePath}`);
      
      setInfoMessage("OPFファイルを解析中...");
      const opfFile = zip.file(rootfilePath);
      if (!opfFile) throw new Error(`OPFファイル (${rootfilePath}) がEPUB内に見つかりません。`);
      const opfXmlText = await opfFile.async("string");
      console.debug("OPFファイル内容 (先頭1000文字):", opfXmlText.substring(0, 1000) + (opfXmlText.length > 1000 ? "..." : ""));
      const opfDoc = parser.parseFromString(opfXmlText, "application/xml");
      
      const dcTitle = opfDoc.querySelector("metadata > dc\\:title")?.textContent;
      if (dcTitle) {
        setTitle(dcTitle); 
      } else {
        setTitle(fileNameWithoutExtension); 
      }
      console.log(`EPUBタイトル (dc:title): ${dcTitle || `見つかりません、ファイル名を使用: ${fileNameWithoutExtension}`}`);

      console.log("マニフェスト解析中...");
      const manifestItems = opfDoc.querySelectorAll("manifest > item");
      const manifest: { [id: string]: { href: string, mediaType: string } } = {};
      manifestItems.forEach(item => {
        const id = item.getAttribute("id");
        const href = item.getAttribute("href");
        const mediaType = item.getAttribute("media-type");
        if (id && href && mediaType) {
          manifest[id] = { href: getAbsolutePath(rootfilePath, href), mediaType };
        }
      });
      console.log(`マニフェスト解析完了: ${Object.keys(manifest).length} 個のアイテム`);
      console.debug("マニフェストオブジェクト全体:", manifest);

      const navItem = Array.from(manifestItems).find(item => item.getAttribute("properties")?.includes("nav"));
      if (navItem) {
          const navItemId = navItem.getAttribute("id");
          if (navItemId && manifest[navItemId] && (manifest[navItemId].mediaType === 'application/xhtml+xml' || manifest[navItemId].mediaType === 'text/html')) {
              tocPath = manifest[navItemId].href;
              tocMediaType = manifest[navItemId].mediaType;
              console.log(`EPUB3 NAVドキュメント候補 (properties="nav"): ${tocPath} (タイプ: ${tocMediaType})`);
          }
      }
      
      if (!tocPath) { 
          const ncxItemId = opfDoc.querySelector("spine")?.getAttribute("toc");
          if (ncxItemId && manifest[ncxItemId]) {
              if (manifest[ncxItemId].mediaType === 'application/x-dtbncx+xml') {
                  tocPath = manifest[ncxItemId].href;
                  tocMediaType = manifest[ncxItemId].mediaType;
                  console.log(`EPUB2 NCX目次候補 (spine@toc): ${tocPath} (タイプ: ${tocMediaType})`);
              } else if (manifest[ncxItemId].mediaType === 'application/xhtml+xml' || manifest[ncxItemId].mediaType === 'text/html') {
                  tocPath = manifest[ncxItemId].href;
                  tocMediaType = manifest[ncxItemId].mediaType;
                  console.log(`EPUB3 NAVドキュメント候補 (spine@toc, XHTML): ${tocPath} (タイプ: ${tocMediaType})`);
              }
          } else { 
              const ncxManifestItem = Object.values(manifest).find(m => m.mediaType === 'application/x-dtbncx+xml');
              if (ncxManifestItem) {
                  tocPath = ncxManifestItem.href;
                  tocMediaType = ncxManifestItem.mediaType;
                  console.log(`EPUB2 NCX目次候補 (manifest media-type): ${tocPath} (タイプ: ${tocMediaType})`);
              }
          }
      }

      if (!tocPath) {
        console.error("目次ファイル特定失敗。OPFファイル内で目次(NAVまたはNCX)への参照が見つかりません。");
      } else {
        setInfoMessage(`目次ファイル (${tocPath}, タイプ: ${tocMediaType}) を解析中...`);
        console.log(`使用する目次ファイル決定: ${tocPath}, タイプ: ${tocMediaType}`);
      }

      const chaptersWithContent: ChapterWithContent[] = [];
      
      if (tocPath && tocMediaType) {
        const tocFile = zip.file(tocPath);
        if (!tocFile) throw new Error(`目次ファイル (${tocPath}) がEPUB内に見つかりません。`);
        const tocXmlText = await tocFile.async("string");
        console.debug(`目次ファイル (${tocPath}) 内容 (先頭1000文字):\n`, tocXmlText.substring(0, 1000) + (tocXmlText.length > 1000 ? "..." : ""));
        const tocDoc = parser.parseFromString(tocXmlText, tocMediaType === "application/xhtml+xml" || tocMediaType === "text/html" ? "application/xhtml+xml" : "application/xml");

        const cleanText = (text: string): string => {
            let cleaned = text.replace(/[ \t\f\v\r]+/g, ' ');
            cleaned = cleaned.replace(/\s*\n\s*/g, '\n');
            return cleaned.trim();
        };
        
        const extractCleanTextFromHtml = (htmlString: string, chapterTitle: string | undefined, anchor?: string): string => {
            const chapterDom = parser.parseFromString(htmlString, "text/html");
            let sourceDescription = "ファイル全体";
            let extractedText = "";
            let targetElement: HTMLElement | null = null;

            if (anchor && chapterDom.body) {
                try {
                  targetElement = chapterDom.body.querySelector(`#${CSS.escape(anchor)}`);
                } catch (e) {
                    targetElement = chapterDom.getElementById(anchor); // Fallback for complex selectors or older browsers
                    console.warn(`CSS.escape or querySelector failed for anchor '${anchor}', using getElementById. Error: ${e instanceof Error ? e.message : String(e)}`);
                }

                if (targetElement) {
                    console.log(`  アンカー #${anchor} に対応する要素 (${targetElement.tagName}) を見つかりました。`);
                    sourceDescription = `アンカー #${anchor} の要素 (${targetElement.tagName})`;
                    const elementClone = targetElement.cloneNode(true) as HTMLElement;
                    elementClone.querySelectorAll('script, style').forEach(el => el.remove());
                    extractedText = cleanText(elementClone.textContent || "");
                    
                    const { empty: isEmptyFromElement, reason: reasonEmptyElement } = isEffectivelyEmpty(extractedText, chapterTitle);
                    if (isEmptyFromElement) {
                        console.warn(`    アンカー要素 (${targetElement.tagName}#${anchor}) のテキストは実質的に空です (${reasonEmptyElement})。後続の兄弟要素からの抽出を試みます。`);
                        let siblingTextContent = "";
                        let currentSibling = targetElement.nextElementSibling;
                        let siblingsProcessedCount = 0;
                        while (currentSibling) {
                            // Stop if we hit another heading, suggesting a new section
                            if (/^H[1-6]$/i.test(currentSibling.tagName)) {
                                console.log(`    次の兄弟要素 (${currentSibling.tagName}) は見出しのため、ここで収集を停止します。`);
                                break;
                            }
                            const siblingClone = currentSibling.cloneNode(true) as HTMLElement;
                            siblingClone.querySelectorAll('script, style').forEach(el => el.remove());
                            siblingTextContent += (siblingClone.textContent || "") + "\n";
                            siblingsProcessedCount++;
                            currentSibling = currentSibling.nextElementSibling;
                        }
                        extractedText = cleanText(siblingTextContent);
                        if (extractedText && siblingsProcessedCount > 0) {
                           console.log(`    アンカー要素の後続の兄弟要素 ${siblingsProcessedCount} 個からテキストを抽出しました。`);
                           sourceDescription = `アンカー #${anchor} の後続の兄弟要素群`;
                        } else {
                           console.warn(`    アンカー要素の後続の兄弟要素からテキストを抽出できませんでした。`);
                           // Stick with the (empty) text from the anchor element itself, or let it fall through to placeholder
                        }
                    }
                } else {
                    console.warn(`  アンカー #${anchor} に対応する要素が見つかりませんでした。ファイル全体のテキストを使用します。`);
                    sourceDescription = "ファイル全体 (アンカー見つからず)";
                    // Fall through to using the whole body
                }
            }
            
            // If no anchor, or anchor element not found, or anchor text + sibling text still empty, use whole body
            if (!extractedText.trim() && chapterDom.body) {
                if (anchor && !targetElement) { // Anchor was specified but not found
                     console.log(`    フォールバック: ${sourceDescription}。ファイル全体のテキストを使用します。`);
                } else if (anchor && targetElement && !extractedText.trim()){ // Anchor found, but its text and sibling text was empty
                    console.log(`    フォールバック: アンカー要素とその後続兄弟要素から有効なテキストが得られませんでした。ファイル全体のテキストを使用します。`);
                }
                sourceDescription = "ファイル全体 (フォールバック)";
                const bodyClone = chapterDom.body.cloneNode(true) as HTMLElement;
                bodyClone.querySelectorAll('script, style').forEach(el => el.remove());
                extractedText = cleanText(bodyClone.textContent || "");
            }

            console.log(`    テキスト抽出元: ${sourceDescription}, 抽出後テキスト長: ${extractedText.length}`);
            return extractedText;
        };
        
        const isEffectivelyEmpty = (text: string, title: string | undefined): { empty: boolean, reason: string } => {
            const trimmedText = text.trim();
            if (!trimmedText) return { empty: true, reason: "内容が空でした" };
            if (title && trimmedText.toLowerCase() === title.trim().toLowerCase()) {
                return { empty: true, reason: "内容がタイトルと同じでした" };
            }
            return { empty: false, reason: "" };
        };


        if (tocMediaType === "application/x-dtbncx+xml") { 
          console.log("NCX目次解析開始...");
          const navPoints = tocDoc.querySelectorAll("navMap > navPoint");
          if (navPoints.length > 0) tocItemsFound = true;
          console.log(`NCX: ${navPoints.length}個のnavPointを検出`);
          for (const navPoint of Array.from(navPoints)) {
            let chapterTitleText = navPoint.querySelector("navLabel > text")?.textContent?.trim();
            const contentSrcRaw = navPoint.querySelector("content")?.getAttribute("src");
            
            const contentSrcParts = contentSrcRaw ? contentSrcRaw.split('#') : [null, null];
            const chapterFilePath = contentSrcParts[0] ? getAbsolutePath(tocPath, contentSrcParts[0]) : null;
            const chapterAnchor = contentSrcParts[1] || undefined;

            if (chapterTitleText && chapterTitleText.length > MAX_TITLE_LENGTH) {
              console.warn(`  NCX NavPoint: タイトル候補 "${chapterTitleText.substring(0,50)}..." は長すぎます (${chapterTitleText.length}文字)。内容が混入している可能性があります。ファイル: ${chapterFilePath}. タイトルを短縮します。`);
              chapterTitleText = chapterTitleText.substring(0, MAX_TITLE_LENGTH) + "...";
            }
            console.log(`  NCX NavPoint: title='${chapterTitleText}', contentSrcRaw='${contentSrcRaw}', resolvedChapterPath='${chapterFilePath}', anchor='${chapterAnchor}'`);
            
            if (chapterTitleText && chapterFilePath) {
              const chapterFile = zip.file(chapterFilePath);
              if (chapterFile) {
                const chapterHtml = await chapterFile.async("string");
                console.debug(`    章ファイル「${chapterFilePath}」ロード成功。HTML内容スニペット (先頭200文字):`, chapterHtml.substring(0,200)+"...");
                
                let extractedContent = extractCleanTextFromHtml(chapterHtml, chapterTitleText, chapterAnchor);
                let finalContent = extractedContent;
                const effectiveEmptyCheck = isEffectivelyEmpty(extractedContent, chapterTitleText);

                if (effectiveEmptyCheck.empty) { // Check final extracted content (could be from anchor, siblings, or whole file)
                    const reason = chapterAnchor ? `指定されたアンカー「#${chapterAnchor}」およびその後続要素からは抽出できませんでした (${effectiveEmptyCheck.reason})` 
                                               : `ファイル全体から抽出できませんでした (${effectiveEmptyCheck.reason})`;
                    console.warn(`    章「${chapterTitleText}」: ${reason}。ファイル: ${chapterFilePath}`);
                    finalContent = `(このセクション「${chapterTitleText}」の具体的な内容は、${reason}。ファイル全体の内容を確認するか、手動で編集してください。)`;
                }
                chaptersWithContent.push({ title: chapterTitleText, content: finalContent });
              } else {
                console.warn(`    チャプターファイルが見つかりません: ${chapterFilePath} (タイトル: ${chapterTitleText})`);
                chaptersWithContent.push({ title: chapterTitleText, content: "(内容が見つかりません)" });
              }
            } else {
              console.warn("    NCX navPointにタイトルまたは有効なcontent srcがありませんでした。スキップします。");
            }
          }
        } else if (tocMediaType === "application/xhtml+xml" || tocMediaType === "text/html") { 
          console.log("EPUB3 NAV目次解析開始...");
          let navLinksNodeList = tocDoc.querySelectorAll("nav[epub\\:type='toc'] a");
          let selectorDescription = "nav[epub\\:type='toc'] a";
          console.log(`NAV: 試行セレクタ '${selectorDescription}', 検出数: ${navLinksNodeList.length}`);

          if (navLinksNodeList.length === 0) {
            const fallbackSelector1 = "nav[role~='doc-toc'] a";
            console.log(`NAV: '${selectorDescription}' で0件検出。フォールバックセレクタ '${fallbackSelector1}' で再試行します。`);
            navLinksNodeList = tocDoc.querySelectorAll(fallbackSelector1);
            selectorDescription = `${fallbackSelector1} (フォールバック1使用)`;
            console.log(`NAV: 試行セレクタ '${selectorDescription}', 検出数: ${navLinksNodeList.length}`);
          }
          
          if (navLinksNodeList.length === 0) {
            const fallbackSelector2 = "body ol a, body ul a"; 
            console.log(`NAV: '${selectorDescription}' で0件検出。フォールバックセレクタ '${fallbackSelector2}' で再試行します。`);
            navLinksNodeList = tocDoc.querySelectorAll(fallbackSelector2);
            selectorDescription = `${fallbackSelector2} (フォールバック2使用)`;
            console.log(`NAV: 試行セレクタ '${selectorDescription}', 検出数: ${navLinksNodeList.length}`);
          }
          
          const navLinks = Array.from(navLinksNodeList);
          if (navLinks.length > 0) tocItemsFound = true;
          console.log(`NAV: 最終的に ${navLinks.length}個のリンクを検出 (使用セレクタ: ${selectorDescription})`);
          
          for (const link of navLinks) {
            let chapterTitleText = link.textContent?.trim();
            const hrefRaw = link.getAttribute("href");

            const hrefParts = hrefRaw ? hrefRaw.split('#') : [null, null];
            const chapterFilePath = hrefParts[0] ? getAbsolutePath(tocPath, hrefParts[0]) : null;
            const chapterAnchor = hrefParts[1] || undefined;

            if (chapterTitleText && chapterTitleText.length > MAX_TITLE_LENGTH) {
              console.warn(`  NAV Link: タイトル候補 "${chapterTitleText.substring(0,50)}..." は長すぎます (${chapterTitleText.length}文字)。内容が混入している可能性があります。ファイル: ${chapterFilePath}. タイトルを短縮します。`);
              chapterTitleText = chapterTitleText.substring(0, MAX_TITLE_LENGTH) + "...";
            }
            console.log(`  NAV Link: title='${chapterTitleText}', hrefRaw='${hrefRaw}', resolvedChapterPath='${chapterFilePath}', anchor='${chapterAnchor}'`);
            
            if (chapterTitleText && chapterFilePath) {
              const chapterFile = zip.file(chapterFilePath);
              if (chapterFile) {
                const chapterHtml = await chapterFile.async("string");
                console.debug(`    章ファイル「${chapterFilePath}」ロード成功。HTML内容スニペット (先頭200文字):`, chapterHtml.substring(0,200)+"...");
                
                let extractedContent = extractCleanTextFromHtml(chapterHtml, chapterTitleText, chapterAnchor);
                let finalContent = extractedContent;
                const effectiveEmptyCheck = isEffectivelyEmpty(extractedContent, chapterTitleText);

                if (effectiveEmptyCheck.empty) {
                    const reason = chapterAnchor ? `指定されたアンカー「#${chapterAnchor}」およびその後続要素からは抽出できませんでした (${effectiveEmptyCheck.reason})` 
                                               : `ファイル全体から抽出できませんでした (${effectiveEmptyCheck.reason})`;
                    console.warn(`    章「${chapterTitleText}」: ${reason}。ファイル: ${chapterFilePath}`);
                    finalContent = `(このセクション「${chapterTitleText}」の具体的な内容は、${reason}。ファイル全体の内容を確認するか、手動で編集してください。)`;
                }
                chaptersWithContent.push({ title: chapterTitleText, content: finalContent });
              } else {
                console.warn(`    チャプターファイルが見つかりません: ${chapterFilePath} (タイトル: ${chapterTitleText})`);
                chaptersWithContent.push({ title: chapterTitleText, content: "(内容が見つかりません)" });
              }
            } else {
               console.warn("    NAVリンクにタイトルまたは有効なhrefがありませんでした。スキップします。");
            }
          }
        }
      }

      console.log("抽出された章の生データ (フィルタリング前):", chaptersWithContent.map(c => ({ title: c.title, contentLength: c.content.length, contentStart: c.content.substring(0,50)+"..." })));

      if (chaptersWithContent.length === 0) {
        if (!tocPath || !tocMediaType) { 
             setError("EPUBから目次ファイル (NCX または NAV) を特定できませんでした。OPFファイルを確認してください。");
        } else if (tocPath && !tocItemsFound) { 
             setError(`EPUBの目次ファイル (${tocPath}) は読み込めましたが、その中から章の項目を抽出できませんでした。目次構造が非標準であるか、空の目次です。ログを確認してください。`);
        } else { 
             setError("EPUB目次から章のタイトルや内容へのリンクを抽出できませんでした。目次の各項目に必要な情報が欠けている可能性があります。ログを確認してください。");
        }
        setInfoMessage(null);
      } else {
        const validChapters = chaptersWithContent.filter(ch => 
            ch.content !== "(内容が見つかりません)" && 
            !(ch.content.startsWith("(このセクション「") || ch.content.startsWith("(この章「")) // Filter out our placeholder messages too for "valid"
        ); 
        // We still add chapters with placeholder messages to onAddChaptersBatch, so user sees them.
        // The validChapters is more for internal logic/messaging about success rate.
        
        console.log("フィルタリング後の有効な章データ (プレースホルダ除く):", validChapters.map(c => ({ title: c.title, contentLength: c.content.length, contentStart: c.content.substring(0,50)+"..." })));
        const chaptersToAdd = chaptersWithContent; // Add all, including those with placeholders

        if (chaptersToAdd.length === 0) { // Should not happen if chaptersWithContent was not empty
             setError("EPUBから有効な章を抽出できませんでした。目次やファイルの構造を確認してください。");
             setInfoMessage(null);
        } else {
            onAddChaptersBatch(chaptersToAdd);
            console.log(`バッチ追加完了: ${chaptersToAdd.length}個の章 (プレースホルダー含む)`);
            setInfoMessage(`${chaptersToAdd.length}個の章がEPUBから抽出・追加されました。一部の章は内容抽出に失敗したためプレースホルダーが表示されている場合があります。モーダルを閉じて内容を確認してください。`);
            setContent(''); 
            
            // Do not automatically close if there was an error message related to parsing.
            // Only auto-close on full success without prior critical errors.
            let shouldAutoClose = true;
            if (error) { // if any error was set during parsing
                const criticalErrorKeywords = ["特定できませんでした", "抽出できませんでした", "見つかりません"];
                if (criticalErrorKeywords.some(keyword => error.includes(keyword))) {
                    shouldAutoClose = false;
                }
            }

            if (shouldAutoClose) { 
                setTimeout(() => {
                    // Check again if the modal is still in a processing state or has a fresh error
                    // This check is a bit redundant given the shouldAutoClose logic, but acts as a safeguard
                    if (!isProcessingFile && infoMessage && infoMessage.includes("抽出・追加されました") && !error) {
                        onClose();
                    }
                }, 2000);
            }
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
    return "ここに章のテキストを貼り付けるか、EPUBをアップロードしてください。";
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
              章のタイトル (手動追加／EPUBからの抽出結果)
            </label>
            <input
              type="text"
              id="chapterTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-gray-700 text-gray-100 border border-gray-600 rounded-md p-2.5 focus:ring-sky-500 focus:border-sky-500 shadow-sm"
              placeholder="例：第1章：始まり（EPUBアップロードで自動入力）"
              disabled={isProcessingFile}
            />
          </div>

          <div className="mb-1 space-y-3">
            <div>
                <label htmlFor="epubUpload" className="block text-sm font-medium text-gray-300 mb-1">
                EPUBをアップロード (章の自動抽出用)
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
                EPUBをアップロードすると、章が自動的に抽出されリストに追加されます。
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
