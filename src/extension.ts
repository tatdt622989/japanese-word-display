// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';

const EXTENSION_CONFIG_NAMESPACE = 'japanese-word-display';
const DEFAULT_API_BASE_URL = 'https://ai-tutor.6yuwei.com/api';
const DEFAULT_UPDATE_INTERVAL_SECONDS = 30;

// 日文單字接口
interface JapaneseWord {
	id: string;
	japanese: string | string[];
	reading: string | string[];
	kana: string | string[];
	chinese: string | string[];
	category: string;
	level?: string;
	partOfSpeech?: string | string[];
	examples?: Array<{
		japanese: string;
		chinese: string;
	}>;
}

// API 響應接口
interface VocabularyResponse {
	success: boolean;
	data: {
		[level: string]: JapaneseWord[];
	};
}

interface ExtensionConfiguration {
	apiBaseUrl: string;
	updateIntervalSeconds: number;
	enableStatusBar: boolean;
}

function getExtensionConfiguration(): ExtensionConfiguration {
	const configuration = vscode.workspace.getConfiguration(EXTENSION_CONFIG_NAMESPACE);
	const apiBaseUrl = configuration.get<string>('apiBaseUrl', DEFAULT_API_BASE_URL).trim() || DEFAULT_API_BASE_URL;
	const configuredUpdateInterval = configuration.get<number>('updateInterval', DEFAULT_UPDATE_INTERVAL_SECONDS);
	const updateIntervalSeconds = Number.isFinite(configuredUpdateInterval) && configuredUpdateInterval > 0
		? configuredUpdateInterval
		: DEFAULT_UPDATE_INTERVAL_SECONDS;

	return {
		apiBaseUrl,
		updateIntervalSeconds,
		enableStatusBar: configuration.get<boolean>('enableStatusBar', true)
	};
}

// 日文單字管理類
class JapaneseWordManager {
	private statusBarItem: vscode.StatusBarItem;
	private words: JapaneseWord[] = [];
	private currentWord: JapaneseWord | null = null;
	private updateInterval: NodeJS.Timeout | null = null;
	private config: ExtensionConfiguration = getExtensionConfiguration();

	constructor() {
		// 創建狀態列項目
		this.statusBarItem = vscode.window.createStatusBarItem(
			'japanese-word-display',
			vscode.StatusBarAlignment.Left,
			100
		);
		this.statusBarItem.command = 'japanese-word-display.showWordDetail';
		this.statusBarItem.name = 'Japanese Word';
		this.statusBarItem.tooltip = new vscode.MarkdownString('**日文單字學習工具**\n\n懸停查看詳情，點擊查看完整資料');
		this.applyConfiguration();
	}

	private applyConfiguration(): void {
		this.config = getExtensionConfiguration();
		if (!this.config.enableStatusBar) {
			this.statusBarItem.hide();
		}
	}

	// 從後端 API 載入單字數據
	async loadVocabularyData(): Promise<void> {
		try {
			const data = await this.makeApiRequest('/vocabulary');
			const response = JSON.parse(data) as VocabularyResponse;
			
			if (response.success) {
				this.words = [];
				// 將所有等級的單字合併，並保留等級資訊
				Object.entries(response.data).forEach(([level, levelWords]) => {
					levelWords.forEach(word => {
						// 為每個單字添加等級資訊
						const wordWithLevel = { ...word, level: level };
						this.words.push(wordWithLevel);
					});
				});
				console.log(`載入了 ${this.words.length} 個日文單字`);
				// 調試：檢查前幾個單字的等級資訊
				console.log('前3個單字的等級資訊:', this.words.slice(0, 3).map(w => ({ japanese: w.japanese, level: w.level })));
			} else {
				throw new Error('API 回應失敗');
			}
		} catch (error) {
			console.error('載入單字數據失敗:', error);
			vscode.window.showErrorMessage('無法載入日文單字數據，使用備用單字');
			// 使用預設單字作為備用
			this.loadDefaultWords();
		}
	}

	// 備用的預設單字
	private loadDefaultWords(): void {
		this.words = [
			{
				id: '1',
				japanese: '学校',
				reading: 'がっこう',
				kana: 'がっこう',
				chinese: ['學校'],
				category: '名詞',
				level: 'N5'
			},
			{
				id: '2',
				japanese: '勉強',
				reading: 'べんきょう',
				kana: 'べんきょう',
				chinese: ['學習', '念書'],
				category: '名詞',
				level: 'N4'
			},
			{
				id: '3',
				japanese: '先生',
				reading: 'せんせい',
				kana: 'せんせい',
				chinese: ['老師'],
				category: '名詞',
				level: 'N5'
			}
		];
		console.log('載入了備用單字數據:', this.words);
	}

	// 發送 API 請求
	private makeApiRequest(endpoint: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const url = `${this.config.apiBaseUrl}${endpoint}`;
			const urlObj = new URL(url);
			const requestModule = urlObj.protocol === 'https:' ? https : http;

			const req = requestModule.get(url, (res) => {
				let data = '';
				res.on('data', (chunk) => {
					data += chunk;
				});
				res.on('end', () => {
					if (res.statusCode === 200) {
						resolve(data);
					} else {
						reject(new Error(`API 請求失敗: ${res.statusCode}`));
					}
				});
			});

			req.on('error', (error) => {
				reject(error);
			});

			req.setTimeout(5000, () => {
				req.destroy();
				reject(new Error('API 請求超時'));
			});
		});
	}

	// 獲取隨機單字
	private getRandomWord(): JapaneseWord | null {
		if (this.words.length === 0) {
			return null;
		}
		return this.words[Math.floor(Math.random() * this.words.length)];
	}

	// 更新狀態列顯示
	updateStatusBar(): void {
		if (!this.config.enableStatusBar) {
			this.statusBarItem.hide();
			return;
		}

		console.log('正在更新狀態列，當前單字數量:', this.words.length);
		this.currentWord = this.getRandomWord();
		console.log('選中的單字:', this.currentWord);
		
		if (this.currentWord) {
			const reading = Array.isArray(this.currentWord.reading) 
				? this.currentWord.reading.join('／')  // 使用全形斜線分隔多個讀音
				: this.currentWord.reading;
			const japanese = Array.isArray(this.currentWord.japanese)
				? this.currentWord.japanese.join('／')  // 使用全形斜線分隔多個寫法
				: this.currentWord.japanese;
			const chinese = Array.isArray(this.currentWord.chinese) 
				? this.currentWord.chinese.join(', ') 
				: this.currentWord.chinese;
			const kana = Array.isArray(this.currentWord.kana)
				? this.currentWord.kana.join(', ')
				: this.currentWord.kana;
			
			// 限制狀態欄顯示的長度，如果太長就截斷
			const maxLength = 20; // 設定最大顯示長度
			const displayJapanese = japanese.length > maxLength ? 
				japanese.substring(0, maxLength) + '...' : japanese;
			const displayReading = reading.length > maxLength ? 
				reading.substring(0, maxLength) + '...' : reading;
			
			const text = `$(book) ${displayJapanese} (${displayReading})`;
			
			// 創建詳細的懸停提示
			const hoverTooltip = new vscode.MarkdownString();
			hoverTooltip.isTrusted = true;
			hoverTooltip.appendMarkdown(`## 📖 ${japanese}\n\n`);
			hoverTooltip.appendMarkdown(`**假名：** ${kana}\n\n`);
			hoverTooltip.appendMarkdown(`**讀音：** ${reading}\n\n`);
			hoverTooltip.appendMarkdown(`**中文：** ${chinese}\n\n`);
			if (this.currentWord.category) {
				hoverTooltip.appendMarkdown(`**類別：** ${this.currentWord.category}\n\n`);
			}
			if (this.currentWord.partOfSpeech) {
				const partOfSpeech = Array.isArray(this.currentWord.partOfSpeech)
					? this.currentWord.partOfSpeech.join(', ')
					: this.currentWord.partOfSpeech;
				hoverTooltip.appendMarkdown(`**詞性：** ${partOfSpeech}\n\n`);
			}
			if (this.currentWord.level) {
				hoverTooltip.appendMarkdown(`**等級：** ${this.currentWord.level}\n\n`);
			}
			if (this.currentWord.examples && this.currentWord.examples.length > 0) {
				hoverTooltip.appendMarkdown(`**例句：**\n\n`);
				this.currentWord.examples.slice(0, 2).forEach((example, index) => {
					hoverTooltip.appendMarkdown(`${index + 1}. ${example.japanese}\n`);
					hoverTooltip.appendMarkdown(`   *${example.chinese}*\n\n`);
				});
			}
			hoverTooltip.appendMarkdown(`---\n\n*點擊查看更多詳細資料*`);
			
			console.log('設置狀態列文字:', text);
			this.statusBarItem.text = text;
			this.statusBarItem.tooltip = hoverTooltip;
			this.statusBarItem.show();
		} else {
			console.log('沒有可用的單字，設置預設文字');
			this.statusBarItem.text = '$(book) 日文單字載入中...';
			this.statusBarItem.tooltip = '正在載入日文單字資料...';
			this.statusBarItem.show();
		}
	}

	// 開始自動更新
	startAutoUpdate(): void {
		this.stopAutoUpdate();
		if (!this.config.enableStatusBar) {
			this.statusBarItem.hide();
			return;
		}

		this.updateStatusBar();
		this.updateInterval = setInterval(() => {
			this.updateStatusBar();
		}, this.config.updateIntervalSeconds * 1000);
	}

	// 停止自動更新
	stopAutoUpdate(): void {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
			this.updateInterval = null;
		}
	}

	// 顯示單字詳細資料
	showWordDetail(): void {
		if (!this.currentWord) {
			vscode.window.showInformationMessage('目前沒有單字可顯示');
			return;
		}

		const word = this.currentWord;
		const japanese = Array.isArray(word.japanese) ? word.japanese.join('／') : word.japanese;

		// 創建 Webview 面板顯示詳細資料
		const panel = vscode.window.createWebviewPanel(
			'japaneseWordDetail',
			`日文單字：${japanese}`,
			vscode.ViewColumn.One,
			{
				enableScripts: true
			}
		);

		panel.webview.html = this.getWordDetailHtml(word);
	}

	// 生成單字詳細資料的 HTML
	private getWordDetailHtml(word: JapaneseWord): string {
		const readings = Array.isArray(word.reading) ? word.reading.join(', ') : word.reading;
		const kanas = Array.isArray(word.kana) ? word.kana.join(', ') : word.kana;
		const chinese = Array.isArray(word.chinese) ? word.chinese.join(', ') : word.chinese;
		const japanese = Array.isArray(word.japanese) 
			? word.japanese.map(j => `<span class="japanese-variant">${j}</span>`).join('')
			: word.japanese;
		// 分享連結
		const shareLink = `https://word.6yuwei.com/${encodeURIComponent(word.id)}`;
		const shareSection = `
			<div class="share-section">
				<div class="share-header">
					<div class="info-label">分享此單字</div>
					<button id="copy-share-link-btn" class="share-btn">
						<span class="btn-icon">📋</span>
						<span class="btn-text">複製分享連結</span>
					</button>
					<span id="copy-status" class="copy-status"></span>
				</div>
				<div id="share-link-text" class="share-link-hidden">${shareLink}</div>
			</div>
		`;
		
		// 處理等級標籤
		const levelBadge = word.level ? `<div class="level-badge">${word.level}</div>` : '';
		
		// 處理單個日文樣式
		const singleJapaneseClass = Array.isArray(word.japanese) && word.japanese.length === 1 ? 'single-japanese' : '';
		
		// 處理詞性區塊
		const partOfSpeechSection = word.partOfSpeech ? `
			<div class="info-section">
				<div class="info-label">詞性</div>
				<div class="info-content">
					${Array.isArray(word.partOfSpeech) 
						? word.partOfSpeech.map(pos => `<span class="part-of-speech">${pos}</span>`).join('') 
						: `<span class="part-of-speech">${word.partOfSpeech}</span>`}
				</div>
			</div>
		` : '';
		
		// 處理分類區塊
		const categorySection = word.category ? `
			<div class="info-section">
				<div class="info-label">分類</div>
				<div class="info-content">${word.category}</div>
			</div>
		` : '';
		
		// 處理例句區塊
		const examplesSection = word.examples && word.examples.length > 0 ? `
			<div class="info-section examples-section">
				<div class="info-label">例句</div>
				${word.examples.map(example => `
					<div class="example-item">
						<div class="example-japanese">${example.japanese}</div>
						<div class="example-chinese">${example.chinese}</div>
					</div>
				`).join('')}
			</div>
		` : '';
		
		// 讀取 HTML 模板並替換占位符
		try {
			const fs = require('fs');
			const path = require('path');
			const templatePath = path.join(__dirname, 'webview', 'word-detail.html');
			let html = fs.readFileSync(templatePath, 'utf-8');
			
			// 替換所有占位符
			html = html
				.replace('{{LEVEL_BADGE}}', levelBadge)
				.replace('{{SINGLE_JAPANESE_CLASS}}', singleJapaneseClass)
				.replace('{{JAPANESE}}', japanese)
				.replace('{{READING}}', readings)
				.replace('{{CHINESE}}', chinese)
				.replace('{{KANA}}', kanas)
				.replace('{{PART_OF_SPEECH_SECTION}}', partOfSpeechSection)
				.replace('{{CATEGORY_SECTION}}', categorySection)
				.replace('{{EXAMPLES_SECTION}}', examplesSection)
				.replace('{{SHARE_SECTION}}', shareSection);
			
			return html;
		} catch (error) {
			console.error('無法讀取 HTML 模板:', error);
			// 如果無法讀取模板，返回簡單的 HTML
			return this.getFallbackHtml(word);
		}
	}
	
	// 備用 HTML（當無法讀取模板時使用）
	private getFallbackHtml(word: JapaneseWord): string {
		const readings = Array.isArray(word.reading) ? word.reading.join(', ') : word.reading;
		const chinese = Array.isArray(word.chinese) ? word.chinese.join(', ') : word.chinese;
		const japanese = Array.isArray(word.japanese) ? word.japanese.join(' / ') : word.japanese;
		const shareLink = `https://word.6yuwei.com/${encodeURIComponent(word.id)}`;
		
		return `<!DOCTYPE html>
		<html lang="zh-TW">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>日文單字詳細資料</title>
			<style>
				body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 20px; }
				.share { margin-bottom: 15px; padding: 6px 12px; border: 1px solid var(--vscode-widget-border); border-radius: 4px; text-align: right; background: var(--vscode-editor-background); opacity: 0.8; }
				.share:hover { opacity: 1; }
				.share-btn { cursor: pointer; background: var(--vscode-input-background); color: var(--vscode-foreground); border: 1px solid var(--vscode-widget-border); padding: 6px 12px; border-radius: 4px; font-size: 1.2em; opacity: 0.85; transition: all 0.2s; }
				.share-btn:hover { background: var(--vscode-list-hoverBackground); color: var(--vscode-foreground); opacity: 1; }
				.word { font-size: 2em; font-weight: bold; margin-bottom: 10px; word-break: break-word; overflow-wrap: break-word; max-width: 100%; }
				.info { margin: 10px 0; font-size: 1.2em; }
				@media (max-width: 600px) { .word { font-size: 1.6em; } .share-btn { font-size: 0.9em; padding: 5px 10px; } }
			</style>
		</head>
		<body>
			<div class="share">
				<button id="copy-share-link-btn" class="share-btn">📋 複製分享連結</button>
				<span id="copy-status" style="margin-left: 10px; font-size: 0.8em; color: var(--vscode-textLink-foreground);"></span>
				<div id="share-link-text" style="display: none;">${shareLink}</div>
			</div>
			<div class="word">${japanese}</div>
			<div class="info"><strong>讀音:</strong> ${readings}</div>
			<div class="info"><strong>中文:</strong> ${chinese}</div>
			${word.level ? `<div class="info"><strong>等級:</strong> ${word.level}</div>` : ''}
			<script>
				document.getElementById('copy-share-link-btn').addEventListener('click', async () => {
					const linkEl = document.getElementById('share-link-text');
					const statusEl = document.getElementById('copy-status');
					try {
						await navigator.clipboard.writeText(linkEl.textContent);
						statusEl.textContent = '已複製！';
						setTimeout(() => statusEl.textContent = '', 2000);
					} catch(e) {
						statusEl.textContent = '複製失敗';
						setTimeout(() => statusEl.textContent = '', 2000);
					}
				});
			</script>
		</body>
		</html>`;
	}

	// 清理資源
	dispose(): void {
		this.stopAutoUpdate();
		this.statusBarItem.dispose();
	}

	async refreshConfiguration(): Promise<void> {
		const previousConfiguration = this.config;
		this.applyConfiguration();

		const apiBaseUrlChanged = previousConfiguration.apiBaseUrl !== this.config.apiBaseUrl;
		const updateIntervalChanged = previousConfiguration.updateIntervalSeconds !== this.config.updateIntervalSeconds;
		const statusBarChanged = previousConfiguration.enableStatusBar !== this.config.enableStatusBar;

		if (apiBaseUrlChanged) {
			await this.loadVocabularyData();
		}

		if (!this.config.enableStatusBar) {
			this.stopAutoUpdate();
			this.statusBarItem.hide();
			return;
		}

		if (apiBaseUrlChanged || updateIntervalChanged || statusBarChanged) {
			this.startAutoUpdate();
		}
	}

	// 獲取當前單字
	getCurrentWord(): JapaneseWord | null {
		return this.currentWord;
	}

	// 獲取單字總數
	getWordsCount(): number {
		return this.words.length;
	}

	// 獲取隨機單字用於出題
	getRandomWordForQuiz(): JapaneseWord | null {
		return this.getRandomWord();
	}

	// 獲取隨機的意思（排除指定單字）
	getRandomMeanings(excludeId: string, count: number): string[] {
		const otherWords = this.words.filter(word => word.id !== excludeId);
		const meanings: string[] = [];
		
		while (meanings.length < count && otherWords.length > 0) {
			const randomWord = otherWords[Math.floor(Math.random() * otherWords.length)];
			const meaning = Array.isArray(randomWord.chinese) ? randomWord.chinese[0] : randomWord.chinese;
			
			if (!meanings.includes(meaning)) {
				meanings.push(meaning);
			}
			
			// 移除已使用的單字以避免重複
			const index = otherWords.indexOf(randomWord);
			otherWords.splice(index, 1);
		}
		
		return meanings;
	}

	// 獲取隨機的讀音（排除指定單字）
	getRandomReadings(excludeId: string, count: number): string[] {
		const otherWords = this.words.filter(word => word.id !== excludeId);
		const readings: string[] = [];
		
		while (readings.length < count && otherWords.length > 0) {
			const randomWord = otherWords[Math.floor(Math.random() * otherWords.length)];
			const reading = Array.isArray(randomWord.reading) ? randomWord.reading[0] : randomWord.reading;
			
			if (!readings.includes(reading)) {
				readings.push(reading);
			}
			
			// 移除已使用的單字以避免重複
			const index = otherWords.indexOf(randomWord);
			otherWords.splice(index, 1);
		}
		
		return readings;
	}

	// 獲取隨機的漢字（排除指定單字）
	getRandomWords(excludeId: string, count: number): string[] {
		const otherWords = this.words.filter(word => word.id !== excludeId);
		const words: string[] = [];
		
		while (words.length < count && otherWords.length > 0) {
			const randomWord = otherWords[Math.floor(Math.random() * otherWords.length)];
			
			const japanese = Array.isArray(randomWord.japanese) ? randomWord.japanese[0] : randomWord.japanese;
			if (!words.includes(japanese)) {
				words.push(japanese);
			}
			
			// 移除已使用的單字以避免重複
			const index = otherWords.indexOf(randomWord);
			otherWords.splice(index, 1);
		}
		
		return words;
	}
}

// 全域變數
let wordManager: JapaneseWordManager;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "japanese-word-display" is now active!');

	// 初始化日文單字管理器
	wordManager = new JapaneseWordManager();

	// 註冊顯示單字詳細資料的命令
	const showDetailDisposable = vscode.commands.registerCommand('japanese-word-display.showWordDetail', () => {
		wordManager.showWordDetail();
	});

	// 註冊刷新單字的命令
	const refreshDisposable = vscode.commands.registerCommand('japanese-word-display.refreshWord', () => {
		wordManager.updateStatusBar();
		vscode.window.showInformationMessage('日文單字已更新！');
	});

	// 註冊開始出題的命令
	const startQuizDisposable = vscode.commands.registerCommand('japanese-word-display.startQuiz', async () => {
		await startQuiz();
	});

	// 註冊顯示例句練習的命令
	const showExamplesDisposable = vscode.commands.registerCommand('japanese-word-display.showExamples', async () => {
		await showExampleQuiz();
	});

	const configurationDisposable = vscode.workspace.onDidChangeConfiguration(async (event) => {
		if (!event.affectsConfiguration(EXTENSION_CONFIG_NAMESPACE)) {
			return;
		}

		await wordManager.refreshConfiguration();
	});

	// 載入單字數據並開始顯示
	wordManager.loadVocabularyData().then(() => {
		wordManager.startAutoUpdate();
	});

	context.subscriptions.push(
		showDetailDisposable,
		refreshDisposable,
		startQuizDisposable,
		showExamplesDisposable,
		configurationDisposable,
		wordManager
	);
}

// 例句練習功能
async function showExampleQuiz(): Promise<void> {
	try {
		if (!wordManager || wordManager.getWordsCount() === 0) {
			vscode.window.showWarningMessage('請先載入日文單字數據');
			return;
		}

		// 獲取有例句的單字
		const wordsWithExamples = getWordsWithExamples();
		if (wordsWithExamples.length === 0) {
			vscode.window.showInformationMessage('目前沒有可用的例句');
			return;
		}

		// 隨機選擇一個有例句的單字
		const targetWord = wordsWithExamples[Math.floor(Math.random() * wordsWithExamples.length)];
		const randomExample = targetWord.examples![Math.floor(Math.random() * targetWord.examples!.length)];

		// 生成選項
		const correctAnswer = Array.isArray(targetWord.chinese) ? targetWord.chinese[0] : targetWord.chinese;
		const wrongAnswers = wordManager.getRandomMeanings(targetWord.id, 3);
		
		const options = [
			{ text: correctAnswer, isCorrect: true },
			...wrongAnswers.map(answer => ({ text: answer, isCorrect: false }))
		];

		// 隨機打亂選項順序
		for (let i = options.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[options[i], options[j]] = [options[j], options[i]];
		}

		const questionText = `以下例句中的「${Array.isArray(targetWord.japanese) ? targetWord.japanese[0] : targetWord.japanese}」是什麼意思？\n\n例句：${randomExample.japanese}\n${randomExample.chinese}`;

		const selectedAnswer = await vscode.window.showQuickPick(
			options.map((option: any, index: number) => ({
				label: `${index + 1}. ${option.text}`,
				description: '',
				detail: '',
				answerData: option
			})),
			{
				placeHolder: questionText,
				canPickMany: false
			}
		);

		if (selectedAnswer) {
			const isCorrect = (selectedAnswer as any).answerData.isCorrect;
			
			if (isCorrect) {
				vscode.window.showInformationMessage('🎉 答對了！例句理解正確！');
			} else {
				vscode.window.showWarningMessage(
					`❌ 答錯了！正確答案是：${correctAnswer}`
				);
			}
		}

	} catch (error) {
		console.error('例句練習功能錯誤:', error);
		vscode.window.showErrorMessage('例句練習功能發生錯誤，請稍後再試');
	}
}

// 獲取有例句的單字
function getWordsWithExamples(): JapaneseWord[] {
	if (!wordManager) {
		return [];
	}
	
	const allWords = (wordManager as any).words || [];
	return allWords.filter((word: JapaneseWord) => 
		word.examples && word.examples.length > 0
	);
}

// 出題功能
async function startQuiz(): Promise<void> {
	try {
		if (!wordManager || wordManager.getWordsCount() === 0) {
			vscode.window.showWarningMessage('請先載入日文單字數據');
			return;
		}

		// 從已載入的單字中生成題目
		const question = generateQuizQuestion();
		if (!question) {
			vscode.window.showErrorMessage('無法生成練習題目');
			return;
		}

		const selectedAnswer = await vscode.window.showQuickPick(
			question.options.map((option: any, index: number) => ({
				label: `${index + 1}. ${option.text}`,
				description: '',
				detail: '',
				answerData: option
			})),
			{
				placeHolder: question.questionText,
				canPickMany: false
			}
		);

		if (selectedAnswer) {
			// 檢查答案
			const isCorrect = (selectedAnswer as any).answerData.isCorrect;
			
			if (isCorrect) {
				vscode.window.showInformationMessage('🎉 答對了！繼續加油！');
			} else {
				vscode.window.showWarningMessage(
					`❌ 答錯了！正確答案是：${question.correctAnswer}`
				);
			}
		}

	} catch (error) {
		console.error('出題功能錯誤:', error);
		vscode.window.showErrorMessage('出題功能發生錯誤，請稍後再試');
	}
}

// 生成練習題目
function generateQuizQuestion(): any {
	if (!wordManager || wordManager.getWordsCount() === 0) {
		return null;
	}

	// 隨機選擇一個單字作為正確答案
	const targetWord = wordManager.getRandomWordForQuiz();
	if (!targetWord) {
		return null;
	}

	// 生成題目類型（隨機選擇）
	const questionTypes = ['meaning', 'reading', 'word'];
	const questionType = questionTypes[Math.floor(Math.random() * questionTypes.length)];

	let questionText = '';
	let correctAnswer = '';
	let wrongAnswers: string[] = [];

	switch (questionType) {
		case 'meaning':
			const japanese = Array.isArray(targetWord.japanese) ? targetWord.japanese[0] : targetWord.japanese;
			questionText = `請選擇「${japanese}」的正確意思：`;
			correctAnswer = Array.isArray(targetWord.chinese) ? targetWord.chinese[0] : targetWord.chinese;
			wrongAnswers = wordManager.getRandomMeanings(targetWord.id, 3);
			break;
		
		case 'reading':
			const japanese2 = Array.isArray(targetWord.japanese) ? targetWord.japanese[0] : targetWord.japanese;
			questionText = `請選擇「${japanese2}」的正確讀音：`;
			correctAnswer = Array.isArray(targetWord.reading) ? targetWord.reading[0] : targetWord.reading;
			wrongAnswers = wordManager.getRandomReadings(targetWord.id, 3);
			break;
		
		case 'word':
			const meaning = Array.isArray(targetWord.chinese) ? targetWord.chinese[0] : targetWord.chinese;
			questionText = `哪個漢字的意思是「${meaning}」？`;
			const japanese3 = Array.isArray(targetWord.japanese) ? targetWord.japanese[0] : targetWord.japanese;
			correctAnswer = japanese3;
			wrongAnswers = wordManager.getRandomWords(targetWord.id, 3);
			break;
	}

	// 創建選項數組
	const options = [
		{ text: correctAnswer, isCorrect: true },
		...wrongAnswers.map(answer => ({ text: answer, isCorrect: false }))
	];

	// 隨機打亂選項順序
	for (let i = options.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[options[i], options[j]] = [options[j], options[i]];
	}

	return {
		questionText,
		options,
		correctAnswer,
		targetWord
	};
}

// This method is called when your extension is deactivated
export function deactivate() {
	if (wordManager) {
		wordManager.dispose();
	}
}
