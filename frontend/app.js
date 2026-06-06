const summaryCards = document.getElementById('summaryCards');
const eventsList = document.getElementById('eventsList');
const message = document.getElementById('message');
const refreshButton = document.getElementById('refreshButton');
const meetingForm = document.getElementById('meetingForm');
const leaveForm = document.getElementById('leaveForm');
const editForm = document.getElementById('editForm');
const deleteForm = document.getElementById('deleteForm');
const meetingFields = Array.from(document.querySelectorAll('.meeting-field'));
const leaveFields = Array.from(document.querySelectorAll('.leave-field'));

const api = async (path, options = {}) => {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const detail = typeof body === 'string' ? body : body.detail || 'Request failed.';
    throw new Error(detail);
  }

  return body;
};

const setMessage = (text, tone = 'neutral') => {
  message.textContent = text;
  message.style.color = tone === 'error' ? '#ffb4b4' : tone === 'success' ? '#bdf8cb' : '#9eb1c9';
};

const formatNumber = (value) => Number(value || 0).toFixed(2);

const renderSummary = (summary) => {
  summaryCards.innerHTML = '';
  const cards = [
    ['Meeting Hours', formatNumber(summary.total_meeting_hours)],
    ['Earned Leave Days', formatNumber(summary.earned_leave_days)],
    ['Leave Taken', formatNumber(summary.leave_days_taken)],
    ['Available Leave', formatNumber(summary.available_leave_days)],
  ];

  for (const [label, value] of cards) {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    summaryCards.appendChild(card);
  }
};

const renderEvents = (events) => {
  if (!events.length) {
    eventsList.innerHTML = '<div class="empty-state">No events yet. Add a meeting or take leave to begin.</div>';
    return;
  }

  eventsList.innerHTML = '';

  for (const event of events) {
    const card = document.createElement('article');
    card.className = 'event-card';

    const typeLabel = event.event_type === 'MEETING' ? 'Meeting' : 'Leave';
    const badgeClass = event.event_type === 'MEETING' ? 'meeting' : 'leave';
    const details = event.event_type === 'MEETING'
      ? `${event.start_time} - ${event.end_time} | ${formatNumber(event.duration_hours)} hrs`
      : `${formatNumber(event.leave_days)} leave day(s)`;

    card.innerHTML = `
      <div class="event-top">
        <div>
          <span class="badge ${badgeClass}">${typeLabel}</span>
          <h3 class="event-title">${event.title || 'Untitled'}</h3>
          <div class="event-meta">
            <span><strong>ID:</strong> ${event.id}</span>
            <span><strong>Date:</strong> ${event.event_date}</span>
            <span><strong>Details:</strong> ${details}</span>
          </div>
        </div>
        <div class="event-actions">
          <button class="inline-link" data-action="edit">Edit</button>
          <button class="inline-link" data-action="delete">Delete</button>
        </div>
      </div>
    `;

    card.querySelector('[data-action="edit"]').addEventListener('click', () => {
      editForm.id.value = event.id;
      editForm.event_type.value = event.event_type === 'MEETING' ? 'meeting' : 'leave';
      editForm.event_date.value = event.event_date;
      editForm.start_time.value = event.start_time || '';
      editForm.end_time.value = event.end_time || '';
      editForm.title.value = event.title || '';
      editForm.leave_days.value = event.leave_days || '';
      toggleEditFields();
      editForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setMessage(`Loaded event ${event.id} into the edit form.`);
    });

    card.querySelector('[data-action="delete"]').addEventListener('click', () => {
      deleteForm.id.value = event.id;
      deleteForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setMessage(`Loaded event ${event.id} into the delete form.`);
    });

    eventsList.appendChild(card);
  }
};

const loadData = async () => {
  try {
    setMessage('Refreshing data...');
    const [summary, events] = await Promise.all([
      api('/summary'),
      api('/events'),
    ]);
    renderSummary(summary);
    renderEvents(events);
    setMessage('Data loaded successfully.', 'success');
  } catch (error) {
    setMessage(error.message, 'error');
    eventsList.innerHTML = '<div class="empty-state">Unable to load events.</div>';
  }
};

const toggleEditFields = () => {
  const isMeeting = editForm.event_type.value === 'meeting';
  meetingFields.forEach((field) => {
    field.style.display = isMeeting ? 'grid' : 'none';
  });
  leaveFields.forEach((field) => {
    field.style.display = isMeeting ? 'none' : 'grid';
  });
};

meetingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(meetingForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    await api('/events/meeting', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    meetingForm.reset();
    await loadData();
    setMessage('Meeting saved.', 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

leaveForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(leaveForm);
  const payload = {
    event_date: formData.get('event_date'),
    leave_days: Number(formData.get('leave_days')),
  };

  try {
    await api('/events/leave', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    leaveForm.reset();
    await loadData();
    setMessage('Leave recorded.', 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

editForm.event_type.addEventListener('change', toggleEditFields);
toggleEditFields();

editForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(editForm);
  const eventId = formData.get('id');
  const eventType = formData.get('event_type');

  const payload = eventType === 'meeting'
    ? {
        event_date: formData.get('event_date') || null,
        start_time: formData.get('start_time') || null,
        end_time: formData.get('end_time') || null,
        title: formData.get('title') || null,
      }
    : {
        event_date: formData.get('event_date') || null,
        leave_days: formData.get('leave_days') ? Number(formData.get('leave_days')) : null,
      };

  try {
    await api(`/events/${eventId}/${eventType}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    await loadData();
    setMessage(`Event ${eventId} updated.`, 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

deleteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(deleteForm);
  const eventId = formData.get('id');

  try {
    await api(`/events/${eventId}`, {
      method: 'DELETE',
    });
    deleteForm.reset();
    await loadData();
    setMessage(`Event ${eventId} deleted.`, 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

refreshButton.addEventListener('click', loadData);
loadData();