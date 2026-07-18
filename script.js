const bookingForm = document.getElementById('bookingForm');
const successMessage = document.getElementById('successMessage');
const bookingDate = document.getElementById('bookingDate');

const today = new Date().toISOString().split('T')[0];
bookingDate.min = today;

bookingForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const formData = new FormData(bookingForm);
  const name = formData.get('name');
  const type = formData.get('type');

  successMessage.textContent = `Thanks, ${name}! Your ${type.toLowerCase()} request is ready for review.`;
  successMessage.classList.add('show');
  bookingForm.reset();
  bookingDate.min = today;
});
