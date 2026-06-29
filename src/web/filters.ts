import type {
  EventData,
  EventFilterTag,
} from './types';

export const EVENT_FILTER_OPTIONS: Array<{
  value: EventFilterTag;
  label: string;
}> = [
  {
    value: 'experience',
    label: '体験会',
  },
  {
    value: 'winning',
    label: '連勝バトル',
  },
  {
    value: 'open',
    label: 'オープン',
  },
  {
    value: 'regular',
    label: 'レギュラー',
  },
  {
    value: 'ambassador',
    label: 'アンバサダー',
  },
  {
    value: 's1',
    label: 'S1',
  },
  {
    value: 'ranked',
    label: 'G1・G2・G3・GP',
  },
  {
    value: 'b4',
    label: 'B4',
  },
  {
    value: 'other',
    label: 'その他',
  },
];

export type EventWeekday =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6;

export const WEEKDAY_OPTIONS: Array<{
  value: EventWeekday;
  label: string;
  className: string;
}> = [
  {
    value: 1,
    label: '月',
    className: '',
  },
  {
    value: 2,
    label: '火',
    className: '',
  },
  {
    value: 3,
    label: '水',
    className: '',
  },
  {
    value: 4,
    label: '木',
    className: '',
  },
  {
    value: 5,
    label: '金',
    className: '',
  },
  {
    value: 6,
    label: '土',
    className:
      'weekday-filter-option--saturday',
  },
  {
    value: 0,
    label: '日',
    className:
      'weekday-filter-option--sunday',
  },
];

export type EventFilterState = {
  selectedTags: Set<EventFilterTag>;
  selectedWeekdays:
    Set<EventWeekday>;
  dateFrom: string;
  dateTo: string;
};

type EventDateInfo = {
  dateKey: string;
  weekday: EventWeekday;
};

export const parseEventDateInfo = (
  startsAtText: string,
): EventDateInfo | null => {
  const match = startsAtText.match(
    /^(\d{4})\/(\d{2})\/(\d{2})/,
  );

  if (
    !match?.[1] ||
    !match[2] ||
    !match[3]
  ) {
    return null;
  }

  const year = Number.parseInt(
    match[1],
    10,
  );
  const month = Number.parseInt(
    match[2],
    10,
  );
  const day = Number.parseInt(
    match[3],
    10,
  );
  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
    ),
  );
  const isValid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!isValid) {
    return null;
  }

  return {
    dateKey:
      `${match[1]}-${match[2]}-${match[3]}`,
    weekday:
      date.getUTCDay() as EventWeekday,
  };
};

const createFilterLabel = (
  tag: EventFilterTag,
  count: number,
): HTMLLabelElement => {
  const option =
    EVENT_FILTER_OPTIONS.find(
      (candidate) =>
        candidate.value === tag,
    );
  const label =
    document.createElement('label');
  label.className =
    'event-filter-option';

  const checkbox =
    document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.name =
    'event-filter-tag';
  checkbox.value = tag;
  checkbox.checked = true;

  const text =
    document.createElement('span');
  text.textContent =
    `${option?.label ?? tag}（${count}）`;

  label.append(checkbox, text);

  return label;
};

const createWeekdayLabel = (
  weekday: EventWeekday,
  count: number,
): HTMLLabelElement => {
  const option =
    WEEKDAY_OPTIONS.find(
      (candidate) =>
        candidate.value === weekday,
    );
  const label =
    document.createElement('label');
  label.className = [
    'event-filter-option',
    'weekday-filter-option',
    option?.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const checkbox =
    document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.name =
    'event-weekday';
  checkbox.value = String(weekday);
  checkbox.checked = true;

  const text =
    document.createElement('span');
  text.textContent =
    `${option?.label ?? weekday}（${count}）`;

  label.append(checkbox, text);

  return label;
};

/**
 * イベントに付いている全属性が選択されている場合だけ表示します。
 * そのため「オープン」のチェックを外すと、
 * G3やS1などのランクに関係なくオープン大会を除外できます。
 */
export const filterEventsByTags = (
  events: EventData[],
  selectedTags:
    Set<EventFilterTag>,
): EventData[] =>
  events.filter((event) =>
    event.eventFilterTags.every(
      (tag) =>
        selectedTags.has(tag),
    ),
  );

export const filterEvents = (
  events: EventData[],
  state: EventFilterState,
): EventData[] => {
  const tagsFiltered =
    filterEventsByTags(
      events,
      state.selectedTags,
    );
  const hasDateConstraint =
    !!state.dateFrom ||
    !!state.dateTo;
  const hasWeekdayConstraint =
    state.selectedWeekdays.size <
      WEEKDAY_OPTIONS.length;

  return tagsFiltered.filter(
    (event) => {
      const dateInfo =
        parseEventDateInfo(
          event.startsAtText,
        );

      if (!dateInfo) {
        return (
          !hasDateConstraint &&
          !hasWeekdayConstraint
        );
      }

      if (
        state.dateFrom &&
        dateInfo.dateKey <
          state.dateFrom
      ) {
        return false;
      }

      if (
        state.dateTo &&
        dateInfo.dateKey >
          state.dateTo
      ) {
        return false;
      }

      return (
        state.selectedWeekdays.has(
          dateInfo.weekday,
        )
      );
    },
  );
};

export type EventFilterController = {
  getState: () =>
    EventFilterState;
};

export const initializeEventFilters = (
  events: EventData[],
  onChange: (
    state: EventFilterState,
  ) => void,
): EventFilterController => {
  const typeContainer =
    document.querySelector<HTMLElement>(
      '#event-type-filters',
    );
  const weekdayContainer =
    document.querySelector<HTMLElement>(
      '#weekday-filters',
    );
  const selectAllTypesButton =
    document.querySelector<HTMLButtonElement>(
      '#select-all-event-types',
    );
  const clearTypesButton =
    document.querySelector<HTMLButtonElement>(
      '#clear-event-types',
    );
  const selectAllWeekdaysButton =
    document.querySelector<HTMLButtonElement>(
      '#select-all-weekdays',
    );
  const clearWeekdaysButton =
    document.querySelector<HTMLButtonElement>(
      '#clear-weekdays',
    );
  const clearDateButton =
    document.querySelector<HTMLButtonElement>(
      '#clear-date-range',
    );
  const dateFromInput =
    document.querySelector<HTMLInputElement>(
      '#date-from',
    );
  const dateToInput =
    document.querySelector<HTMLInputElement>(
      '#date-to',
    );

  if (
    !typeContainer ||
    !weekdayContainer ||
    !selectAllTypesButton ||
    !clearTypesButton ||
    !selectAllWeekdaysButton ||
    !clearWeekdaysButton ||
    !clearDateButton ||
    !dateFromInput ||
    !dateToInput
  ) {
    throw new Error(
      'イベントフィルターの表示要素が見つかりません',
    );
  }

  const tagCounts = new Map<
    EventFilterTag,
    number
  >();

  for (
    const option
      of EVENT_FILTER_OPTIONS
  ) {
    tagCounts.set(
      option.value,
      0,
    );
  }

  const weekdayCounts = new Map<
    EventWeekday,
    number
  >();

  for (
    const option
      of WEEKDAY_OPTIONS
  ) {
    weekdayCounts.set(
      option.value,
      0,
    );
  }

  const eventDateKeys: string[] = [];

  for (const event of events) {
    for (
      const tag
        of event.eventFilterTags
    ) {
      tagCounts.set(
        tag,
        (tagCounts.get(tag) ?? 0) +
          1,
      );
    }

    const dateInfo =
      parseEventDateInfo(
        event.startsAtText,
      );

    if (dateInfo) {
      weekdayCounts.set(
        dateInfo.weekday,
        (
          weekdayCounts.get(
            dateInfo.weekday,
          ) ?? 0
        ) + 1,
      );
      eventDateKeys.push(
        dateInfo.dateKey,
      );
    }
  }

  typeContainer.replaceChildren(
    ...EVENT_FILTER_OPTIONS.map(
      (option) =>
        createFilterLabel(
          option.value,
          tagCounts.get(
            option.value,
          ) ?? 0,
        ),
    ),
  );

  weekdayContainer.replaceChildren(
    ...WEEKDAY_OPTIONS.map(
      (option) =>
        createWeekdayLabel(
          option.value,
          weekdayCounts.get(
            option.value,
          ) ?? 0,
        ),
    ),
  );

  eventDateKeys.sort();

  const firstDate =
    eventDateKeys[0] ?? '';
  const lastDate =
    eventDateKeys.at(-1) ?? '';

  if (firstDate) {
    dateFromInput.min =
      firstDate;
    dateToInput.min =
      firstDate;
  }

  if (lastDate) {
    dateFromInput.max =
      lastDate;
    dateToInput.max =
      lastDate;
  }

  const getSelectedTags = ():
    Set<EventFilterTag> =>
      new Set(
        [
          ...typeContainer
            .querySelectorAll<
              HTMLInputElement
            >(
              'input[name="event-filter-tag"]:checked',
            ),
        ].map(
          (checkbox) =>
            checkbox.value as EventFilterTag,
        ),
      );

  const getSelectedWeekdays = ():
    Set<EventWeekday> =>
      new Set(
        [
          ...weekdayContainer
            .querySelectorAll<
              HTMLInputElement
            >(
              'input[name="event-weekday"]:checked',
            ),
        ].map(
          (checkbox) =>
            Number.parseInt(
              checkbox.value,
              10,
            ) as EventWeekday,
        ),
      );

  const getState = ():
    EventFilterState => ({
      selectedTags:
        getSelectedTags(),
      selectedWeekdays:
        getSelectedWeekdays(),
      dateFrom:
        dateFromInput.value,
      dateTo:
        dateToInput.value,
    });

  const notify = (): void => {
    onChange(getState());
  };

  const normalizeDateRange = (
    changedInput:
      HTMLInputElement,
  ): void => {
    if (
      !dateFromInput.value ||
      !dateToInput.value ||
      dateFromInput.value <=
        dateToInput.value
    ) {
      return;
    }

    if (
      changedInput ===
      dateFromInput
    ) {
      dateToInput.value =
        dateFromInput.value;
    } else {
      dateFromInput.value =
        dateToInput.value;
    }
  };

  typeContainer.addEventListener(
    'change',
    notify,
  );
  weekdayContainer.addEventListener(
    'change',
    notify,
  );

  dateFromInput.addEventListener(
    'change',
    () => {
      normalizeDateRange(
        dateFromInput,
      );
      notify();
    },
  );

  dateToInput.addEventListener(
    'change',
    () => {
      normalizeDateRange(
        dateToInput,
      );
      notify();
    },
  );

  selectAllTypesButton
    .addEventListener(
      'click',
      () => {
        for (
          const checkbox
            of typeContainer
              .querySelectorAll<
                HTMLInputElement
              >(
                'input[name="event-filter-tag"]',
              )
        ) {
          checkbox.checked = true;
        }

        notify();
      },
    );

  clearTypesButton
    .addEventListener(
      'click',
      () => {
        for (
          const checkbox
            of typeContainer
              .querySelectorAll<
                HTMLInputElement
              >(
                'input[name="event-filter-tag"]',
              )
        ) {
          checkbox.checked = false;
        }

        notify();
      },
    );

  selectAllWeekdaysButton
    .addEventListener(
      'click',
      () => {
        for (
          const checkbox
            of weekdayContainer
              .querySelectorAll<
                HTMLInputElement
              >(
                'input[name="event-weekday"]',
              )
        ) {
          checkbox.checked = true;
        }

        notify();
      },
    );

  clearWeekdaysButton
    .addEventListener(
      'click',
      () => {
        for (
          const checkbox
            of weekdayContainer
              .querySelectorAll<
                HTMLInputElement
              >(
                'input[name="event-weekday"]',
              )
        ) {
          checkbox.checked = false;
        }

        notify();
      },
    );

  clearDateButton
    .addEventListener(
      'click',
      () => {
        dateFromInput.value = '';
        dateToInput.value = '';
        notify();
      },
    );

  return {
    getState,
  };
};
