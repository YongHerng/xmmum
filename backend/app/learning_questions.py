"""Shared question validation, grading, and answer formatting (no browser answer keys)."""

import json
import unicodedata


QUESTION_TYPES = {
    'single': 'Single Answer',
    'multiple': 'Multiple Answer',
    'fill': 'Fill in the Blank',
    'matching': 'Mix Match',
}


def kind(question):
    return question.get('question_type') or 'single'


def key_for(question):
    key = question.get('answer_key')
    return question['correct_index'] if key is None else key


def normalized_text(value):
    return ' '.join(unicodedata.normalize('NFKC', value).casefold().split())


def text(value, label, limit):
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
        raise ValueError(f'{label} is required and must be at most {limit:,} characters.')
    return value.strip()


def as_list(value):
    return value if isinstance(value, list) else [] if value is None else [value]


def author_values(data):
    prompt = text(data.get('prompt'), 'Question', 1500)
    explanation = text(data.get('explanation'), 'Explanation', 2000)
    question_type = data.get('question_type', 'single')
    if not isinstance(question_type, str) or question_type not in QUESTION_TYPES:
        raise ValueError('Choose a supported question type.')
    correct_index = -1
    if question_type in ('single', 'multiple'):
        options = [text(data.get(f'option_{i}'), f'Option {i + 1}', 500) for i in range(4)]
        if len({normalized_text(option) for option in options}) != 4:
            raise ValueError('Use four distinct options and choose the correct answer(s) from A–D.')
        try:
            if question_type == 'single':
                correct_index = int(data.get('correct_index', ''))
                if not 0 <= correct_index <= 3:
                    raise ValueError
                answer_key = correct_index
            else:
                selected = as_list(data.get('correct_indices'))
                answer_key = sorted({int(index) for index in selected})
                if len(answer_key) < 2 or len(answer_key) != len(selected) or any(not 0 <= i <= 3 for i in answer_key):
                    raise ValueError
        except (TypeError, ValueError):
            raise ValueError('Choose at least two correct answers using A–D.' if question_type == 'multiple' else 'Choose the correct answer using A–D.') from None
    elif question_type == 'fill':
        raw = text(data.get('accepted_answers'), 'Accepted answers', 5000)
        answer_key = [text(line, 'Accepted answer', 500) for line in raw.splitlines() if line.strip()]
        if not 1 <= len(answer_key) <= 10 or len({normalized_text(line) for line in answer_key}) != len(answer_key):
            raise ValueError('Enter 1–10 distinct accepted answers, one per line.')
        options = []
    else:
        pairs = []
        for i in range(6):
            left, right = data.get(f'match_left_{i}', ''), data.get(f'match_right_{i}', '')
            if left or right:
                pairs.append((text(left, f'Pair {i + 1} item', 500), text(right, f'Pair {i + 1} match', 500)))
        if len(pairs) < 2:
            raise ValueError('Add 2–6 complete matching pairs.')
        if any(len({normalized_text(pair[side]) for pair in pairs}) != len(pairs) for side in (0, 1)):
            raise ValueError('Use unique items and unique matches so every pair is unambiguous.')
        right = sorted(pair[1] for pair in pairs)
        options = {'left': [pair[0] for pair in pairs], 'right': right}
        answer_key = [right.index(pair[1]) for pair in pairs]
    return prompt, json.dumps(options), correct_index, explanation, question_type, json.dumps(answer_key)


def normalize_response(question, answer):
    question_type = kind(question)
    try:
        if question_type == 'fill':
            return text(answer, 'Your answer', 500)
        if question_type == 'matching':
            total = len(question['options']['left'])
            if not isinstance(answer, dict) or set(answer) != {str(i) for i in range(total)}:
                raise ValueError
            result = [int(answer[str(i)]) for i in range(total)]
            if sorted(result) != list(range(total)):
                raise ValueError
            return result
        if question_type == 'multiple':
            values = as_list(answer)
            result = sorted({int(value) for value in values})
            if not result or len(result) != len(values) or any(not 0 <= i < len(question['options']) for i in result):
                raise ValueError
            return result
        result = int(answer)
        if not 0 <= result < len(question['options']):
            raise ValueError
        return result
    except (TypeError, ValueError, KeyError):
        raise ValueError('Please answer every question with a valid response. For matching questions, use each match once.') from None


def answer_is_correct(question, answer):
    answer_key = key_for(question)
    if kind(question) == 'fill':
        return normalized_text(answer) in {normalized_text(value) for value in answer_key}
    return answer == answer_key


def display_answer(question, answer, correct=False):
    question_type = kind(question)
    if question_type == 'fill':
        return ' / '.join(answer) if correct else answer
    if question_type == 'matching':
        return '; '.join(f'{left} → {question["options"]["right"][index]}' for left, index in zip(question['options']['left'], answer))
    if question_type == 'multiple':
        return '; '.join(f'{chr(65 + index)}. {question["options"][index]}' for index in answer)
    return question['options'][answer]


def author_fields(question):
    """Restore saved values into the same fields used for a new draft."""
    result = dict(question)
    question_type = kind(question)
    key = key_for(question)
    if question_type in ('single', 'multiple'):
        result.update({f'option_{i}': option for i, option in enumerate(question['options'])})
        if question_type == 'multiple':
            result['correct_indices'] = key
    elif question_type == 'fill':
        result['accepted_answers'] = '\n'.join(key)
    else:
        for i, (left, index) in enumerate(zip(question['options']['left'], key)):
            result[f'match_left_{i}'] = left
            result[f'match_right_{i}'] = question['options']['right'][index]
    return result

