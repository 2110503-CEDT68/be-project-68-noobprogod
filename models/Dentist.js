const mongoose = require('mongoose');

// Dentist.js
// Schema for dentist information (name, years of experience, area of expertise)
const DentistSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a name'],
        trim: true,
        maxlength: [100, 'Name cannot exceed 100 characters']
    },
    yearsOfExperience: {
        type: Number,
        required: [true, 'Please provide years of experience'],
        min: [0, 'Experience cannot be negative']
    },
    expertise: {
        type: String,
        required: [true, 'Please add an area of expertise'],
        trim: true
    },
    bookingLimitPerDay: {
        type: Number,
        required: false,
        default: null,
        min: [1, 'Booking limit must be at least 1']
    }
}, {
    toJSON: {virtuals: true},
    toObject: {virtuals: true}
});

//Reverse populate with virtuals (appointments booked with this dentist)
DentistSchema.virtual('appointments', {
    ref: 'Appointment',
    localField: '_id',
    foreignField: 'dentist',
    justOne: false
});

module.exports = mongoose.model('Dentist', DentistSchema);