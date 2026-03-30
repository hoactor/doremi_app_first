
/**
 * 텍스트를 유튜브 쇼츠/릴스 자막 스타일에 맞춰 자동으로 줄바꿈합니다.
 * 제시된 3단계 알고리즘 가이드를 반영합니다.
 */
export const applySmartLineBreaks = (text: string): string => {
    if (!text) return '';
    
    // 이미 줄바꿈이 있는 경우 사용자 입력을 존중
    if (text.includes('\n')) {
        return text;
    }

    const cleanText = text.replace(/\s+/g, ' ').trim();
    const length = cleanText.length;

    // [1단계: 목표 줄 수 결정]
    let targetLines = 1;
    if (length <= 15) targetLines = 1;
    else if (length <= 32) targetLines = 2;
    else if (length <= 48) targetLines = 3;
    else if (length <= 64) targetLines = 4;
    else if (length <= 80) targetLines = 5;
    else targetLines = 6;

    if (targetLines === 1) return cleanText;

    // [2단계: 어디를 자를지 탐색 (Break Point Detection)]
    const words = cleanText.split(' ');
    const idealCharsPerLine = Math.ceil(length / targetLines);
    let resultLines: string[] = [];
    let currentLine = "";

    // 우선순위 정규표현식
    const PUNC = /[.?!,]$/;
    const ENDING = /([고며면서니고]|는데|니까)$/;
    const PARTICLE = /([은는이가을를에])$/;

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        
        // 현재 줄에 단어를 추가했을 때 이상적인 길이에 도달하거나 넘으면 분절 검토
        if (currentLine.length + word.length >= idealCharsPerLine && resultLines.length < targetLines - 1) {
            // 우선순위 체크: 현재 단어가 끊기 좋은 위치인가?
            const isGoodPoint = PUNC.test(word) || ENDING.test(word) || PARTICLE.test(word);
            
            // 만약 다음 단어가 아주 짧거나 현재 위치가 좋은 포인트라면 끊음
            if (isGoodPoint || currentLine.length > 14) {
                resultLines.push((currentLine + " " + word).trim());
                currentLine = "";
                continue;
            }
        }
        
        currentLine += (currentLine === "" ? "" : " ") + word;
    }
    
    if (currentLine !== "") {
        resultLines.push(currentLine.trim());
    }

    // [3단계: 밸런싱 (Visual Balancing)]
    // 마지막 줄에 2글자 이하가 남으면 앞줄의 마지막 어절을 뒤로 보냄
    if (resultLines.length > 1) {
        const lastLineIdx = resultLines.length - 1;
        const lastLine = resultLines[lastLineIdx];
        
        if (lastLine.replace(/\s/g, '').length <= 2) {
            const prevLine = resultLines[lastLineIdx - 1];
            const prevWords = prevLine.split(' ');
            
            if (prevWords.length > 1) {
                const movedWord = prevWords.pop();
                resultLines[lastLineIdx - 1] = prevWords.join(' ');
                resultLines[lastLineIdx] = movedWord + " " + lastLine;
            }
        }
    }

    return resultLines.join('\n');
};
